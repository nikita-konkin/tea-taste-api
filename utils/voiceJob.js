const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const TeaForm = require('../models/teaform');
const { uploadDir } = require('../middlewares/upload');
const { ownsUpload } = require('../controllers/uploads');
const { reserve } = require('./voiceQuota');
const {
  concatMp3, hasFfmpeg, squeezeForRecognition, MAX_TRACK_SECONDS,
} = require('./audio');
const speechkit = require('./speechkit');

// One in-process worker, no queue service. This app has no Redis and a tasting
// produces one track: the state machine lives in voice.status, and the pieces
// that survive a restart (status + operationId) are what resume() reads.
const inFlight = new Set();

const POLL_START_MS = 3000;
const POLL_MAX_MS = 30000;
const POLL_DEADLINE_MS = 10 * 60 * 1000;

const setVoice = (owner, sessionId, fields) => TeaForm.updateOne(
  { owner, sessionId },
  Object.keys(fields).reduce((acc, key) => ({ ...acc, [`voice.${key}`]: fields[key] }), {}),
);

const fail = (owner, sessionId, message) => setVoice(owner, sessionId, {
  status: 'error',
  error: String(message || '').slice(0, 500),
}).catch(() => {});

const unlinkUpload = (url, owner) => {
  const filename = path.basename(String(url || ''));
  if (!filename || !ownsUpload(filename, owner)) return;
  fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
};

const readable = async (file) => fs.promises.access(file, fs.constants.R_OK)
  .then(() => true)
  .catch(() => false);

// Ascending by brewingNumber, which puts the general note (0) first and then the
// проливы in the order they were poured. Array#sort is stable, so two notes on
// the same пролив keep the order they were recorded in.
const orderedSegments = (voice) => [...((voice && voice.segments) || [])]
  .sort((a, b) => (a.brewingNumber || 0) - (b.brewingNumber || 0));

// The recordings of one пролив, together, in пролив order.
//
// `brewingNumber` is the user's own answer to "which пролив is this?" — they
// tapped record inside that пролив's block — and it used to be read for sort
// order and then dropped. Everything was merged into one track, recognised as
// one job, and the model was asked to find the boundaries again in the words.
// It cannot: a taster describing пролив 4 does not announce "пролив four", so
// several проливы collapsed into one and the rest got no suggestion at all.
const groupSegments = (segments) => {
  const groups = new Map();
  segments.forEach((segment) => {
    const n = Number(segment.brewingNumber) || 0;
    const whole = Boolean(segment.whole);
    // Keyed on both: an imported whole-session recording and a general «о чае»
    // note both carry brewingNumber 0, and merging them would hand the
    // extraction one blob labelled as a note about the tea.
    const key = whole ? 'whole' : `n${n}`;
    if (!groups.has(key)) groups.set(key, { n, whole, segs: [] });
    groups.get(key).segs.push(segment);
  });
  // The general note first, then the whole-session recording, then the проливы:
  // the order the flat transcript reads in.
  return [...groups.values()]
    .sort((a, b) => (a.n - b.n) || (Number(a.whole) - Number(b.whole)));
};

const partLabel = (part) => {
  if (part.whole) return 'Вся сессия';
  return part.brewingNumber ? `Пролив ${part.brewingNumber}` : 'О чае';
};

// The flat transcript the reader is shown, rebuilt from the parts. Headed by
// пролив so the page shows the same structure the extraction now works from —
// but a lone note is the whole transcript and needs no heading.
const joinParts = (parts, key) => {
  const rows = parts
    .map((part) => ({ part, text: String(part[key] || '').trim() }))
    .filter((row) => row.text);
  if (rows.length <= 1) return rows.length ? rows[0].text : '';
  return rows.map((row) => `${partLabel(row.part)}. ${row.text}`).join('\n');
};

// Declared once, outside the loop: a closure built per iteration over a `wait`
// that the loop reassigns is the shape that silently captures the wrong delay.
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const pollTranscript = async (operationId) => {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let wait = POLL_START_MS;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    await sleep(wait);
    wait = Math.min(Math.round(wait * 1.5), POLL_MAX_MS);
    if (await speechkit.isDone(operationId)) return speechkit.fetchTranscript(operationId);
  }
  /* eslint-enable no-await-in-loop */

  throw new Error('Расшифровка не завершилась за отведённое время.');
};

// One пролив's recordings, submitted as a single recognition job.
//
// Deliberately NOT the merged track: that one is for playback, and recognising
// it as a whole is what lost the пролив boundaries. Recognition is billed per
// 15 s per call, so a пролив of two short notes rounds up where the merged
// track would not — a few kopeks against suggestions that land on the right
// пролив.
const submitGroup = async (files) => {
  // A group of one needs no concat, which also spares it a second lossy
  // generation before the squeeze.
  const joinedPath = files.length === 1
    ? null
    : path.join(os.tmpdir(), `tea-part-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp3`);
  if (joinedPath) await concatMp3(files, joinedPath);

  // Silence is billed exactly like speech, so it goes before the upload — from
  // this throwaway copy only, never from anything the user plays back.
  const squeezed = await squeezeForRecognition(joinedPath || files[0]);
  try {
    return await speechkit.submit(squeezed.path);
  } finally {
    // Guarded: when nothing was squeezed the path IS the input, and for a
    // single-file group that input is the user's own recording.
    if (squeezed.squeezed) await fs.promises.unlink(squeezed.path).catch(() => {});
    if (joinedPath) await fs.promises.unlink(joinedPath).catch(() => {});
  }
};

// Collects what was submitted and stores it attributed to its пролив.
const collect = async (owner, sessionId, pending) => {
  const parts = [];
  /* eslint-disable no-await-in-loop */
  for (const job of pending) {
    const { text, raw } = await pollTranscript(job.operationId);
    parts.push({
      brewingNumber: Number(job.brewingNumber) || 0,
      whole: Boolean(job.whole),
      transcript: text,
      // Kept beside the readable one because normalization rewrites numbers,
      // and the field extraction has to read what was said rather than what
      // the normalizer made of it.
      transcriptRaw: raw,
    });
    await speechkit.cleanup(job.operationId);
  }
  /* eslint-enable no-await-in-loop */

  const kept = parts.filter((part) => String(part.transcript || '').trim());

  await setVoice(owner, sessionId, {
    parts: kept,
    // The flat pair stays: it is what the player shows, and what a record made
    // before parts existed still falls back to.
    transcript: joinParts(kept, 'transcript'),
    transcriptRaw: joinParts(kept, 'transcriptRaw'),
    pending: [],
    status: 'done',
    operationId: '',
    error: '',
    // A new transcript invalidates the stored YandexGPT result — otherwise the
    // form would keep offering suggestions drawn from audio that no longer exists.
    extraction: null,
    extractedAt: null,
  });
};

// Every group submitted, then every group polled — in that order, and with the
// operation ids written down in between. A restart between the two halves would
// otherwise pay SpeechKit a second time for recognition already bought.
const transcribe = async (owner, sessionId, groups, seconds) => {
  // Booked before the upload: refusing afterwards would still be billed.
  const quota = await reserve(owner, seconds);
  if (!quota.ok) return fail(owner, sessionId, quota.reason);

  const pending = [];
  /* eslint-disable no-await-in-loop */
  for (const group of groups) {
    const submitted = await submitGroup(group.files);
    if (!submitted.ok) return fail(owner, sessionId, submitted.reason);
    pending.push({
      brewingNumber: group.n,
      whole: Boolean(group.whole),
      operationId: submitted.operationId,
    });
  }
  /* eslint-enable no-await-in-loop */

  await setVoice(owner, sessionId, { pending, status: 'processing' });
  return collect(owner, sessionId, pending);
};

// Merge, then recognise. Resumable: called with an operationId it skips straight
// to polling, which is what makes a redeploy mid-recognition survivable instead
// of leaving the form stuck on "processing" forever.
const run = async (owner, sessionId, resumeOperationId) => {
  const key = `${owner}:${sessionId}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  try {
    if (resumeOperationId) {
      const { text, raw } = await pollTranscript(resumeOperationId);
      await setVoice(owner, sessionId, {
        transcript: text, transcriptRaw: raw, status: 'done', operationId: '', error: '',
      });
      await speechkit.cleanup(resumeOperationId);
      return;
    }

    const form = await TeaForm.findOne({ owner, sessionId });
    if (!form) return;

    // A restart landed between submitting the проливы and collecting them. The
    // recognition is already bought; poll it rather than paying for it twice.
    const outstanding = (form.voice && form.voice.pending) || [];
    if (outstanding.length) {
      await collect(owner, sessionId, outstanding.map((job) => ({
        brewingNumber: job.brewingNumber,
        whole: Boolean(job.whole),
        operationId: job.operationId,
      })));
      return;
    }

    const segments = orderedSegments(form.voice);
    if (!segments.length) {
      await setVoice(owner, sessionId, { status: 'idle' });
      return;
    }

    if (!await hasFfmpeg()) {
      await fail(owner, sessionId, 'Обработка аудио на сервере недоступна.');
      return;
    }

    // Resolved per пролив rather than into one flat list: the grouping is what
    // recognition is now driven by. A пролив whose files have all gone missing
    // drops out entirely instead of shifting the others' numbering.
    const groups = [];
    /* eslint-disable no-await-in-loop */
    for (const { n, whole, segs } of groupSegments(segments)) {
      const groupFiles = [];
      for (const segment of segs) {
        const filename = path.basename(String(segment.url || ''));
        // Another account's upload url in someone's draft is the one thing that
        // must never be recognised on this owner's quota.
        if (ownsUpload(filename, owner)) {
          const file = path.join(uploadDir, filename);
          if (await readable(file)) groupFiles.push(file);
        }
      }
      if (groupFiles.length) groups.push({ n, whole, files: groupFiles });
    }
    /* eslint-enable no-await-in-loop */

    if (!groups.length) {
      await fail(owner, sessionId, 'Файлы записей не найдены.');
      return;
    }

    // The playable track is still every recording end to end, in пролив order.
    // Only recognition is split.
    const files = groups.flatMap((group) => group.files);

    await setVoice(owner, sessionId, { status: 'processing', error: '' });

    // Random name rather than one derived from the session: the URL changes on
    // every re-merge, so a player that already loaded the old track cannot serve
    // stale audio out of the browser cache. The previous file is removed below.
    const trackName = `${owner}-${Date.now()}${crypto.randomBytes(4).toString('hex')}.mp3`;
    const trackPath = path.join(uploadDir, trackName);
    const { duration } = await concatMp3(files, trackPath);

    // Checked on the measured length, not on the durations the client reported.
    if (duration > MAX_TRACK_SECONDS + 1) {
      await fs.promises.unlink(trackPath).catch(() => {});
      await fail(
        owner,
        sessionId,
        `Общая длительность записей — ${Math.round(duration)} с, максимум ${MAX_TRACK_SECONDS} с.`,
      );
      return;
    }

    const previousTrack = form.voice && form.voice.track && form.voice.track.url;
    await setVoice(owner, sessionId, {
      track: { url: `/api/uploads/${trackName}`, duration },
    });
    if (previousTrack && previousTrack !== `/api/uploads/${trackName}`) {
      unlinkUpload(previousTrack, owner);
    }

    // Without SpeechKit credentials the feature degrades to what Phase A gives
    // on its own: a merged, playable soundtrack and no transcript. Same shape as
    // VK OAuth being dormant until its keys are set.
    if (!speechkit.isConfigured()) {
      await setVoice(owner, sessionId, { status: 'idle', error: '' });
      return;
    }

    await transcribe(owner, sessionId, groups, duration);
  } catch (err) {
    await fail(owner, sessionId, err.message);
  } finally {
    inFlight.delete(key);
  }
};

// Fire and forget from the request handlers: a tasting is saved whether or not
// the recognition that follows succeeds.
const enqueue = (owner, sessionId) => {
  // Not under jest: a background write landing mid-assertion makes the HTTP
  // tests race against themselves. The suite drives run() directly instead.
  if (process.env.NODE_ENV === 'test') return;
  setImmediate(() => {
    run(owner, sessionId).catch(() => {});
  });
};

// Called once from app.js after the DB connects. A container restart between
// "submitted to SpeechKit" and "transcript saved" would otherwise strand the
// form on processing with nothing ever polling for it again.
const resume = async () => {
  const stuck = await TeaForm.find({
    'voice.status': { $in: ['queued', 'processing'] },
  }).select('owner sessionId voice.operationId voice.pending voice.status');

  stuck.forEach((form) => {
    const operationId = form.voice && form.voice.operationId;
    setImmediate(() => {
      run(form.owner, form.sessionId, operationId || undefined).catch(() => {});
    });
  });

  return stuck.length;
};

module.exports = {
  run, enqueue, resume, orderedSegments, groupSegments, joinParts,
};
