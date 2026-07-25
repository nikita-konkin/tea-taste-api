const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TeaForm = require('../models/teaform');
const { uploadDir } = require('../middlewares/upload');
const { ownsUpload } = require('../controllers/uploads');
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

const pollTranscript = async (operationId) => {
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let wait = POLL_START_MS;

  /* eslint-disable no-await-in-loop */
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = Math.min(Math.round(wait * 1.5), POLL_MAX_MS);
    if (await speechkit.isDone(operationId)) return speechkit.fetchTranscript(operationId);
  }
  /* eslint-enable no-await-in-loop */

  throw new Error('Расшифровка не завершилась за отведённое время.');
};

const transcribe = async (owner, sessionId, trackPath) => {
  // Recognition is billed per 15 s, so the silence goes before the upload — but
  // only from this throwaway copy, never from the track the user plays back.
  const squeezed = await squeezeForRecognition(trackPath);
  if (squeezed.squeezed) {
    console.log(`voice: ${Math.round(squeezed.before)}s -> ${Math.round(squeezed.after)}s for recognition`);
  }

  const submitted = await speechkit.submit(squeezed.path);
  if (squeezed.squeezed) await fs.promises.unlink(squeezed.path).catch(() => {});
  if (!submitted.ok) return fail(owner, sessionId, submitted.reason);

  await setVoice(owner, sessionId, { operationId: submitted.operationId, status: 'processing' });

  const transcript = await pollTranscript(submitted.operationId);
  await setVoice(owner, sessionId, {
    transcript,
    status: 'done',
    operationId: '',
    error: '',
  });
  return speechkit.cleanup(submitted.operationId);
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
      const transcript = await pollTranscript(resumeOperationId);
      await setVoice(owner, sessionId, {
        transcript, status: 'done', operationId: '', error: '',
      });
      await speechkit.cleanup(resumeOperationId);
      return;
    }

    const form = await TeaForm.findOne({ owner, sessionId });
    if (!form) return;

    const segments = orderedSegments(form.voice);
    if (!segments.length) {
      await setVoice(owner, sessionId, { status: 'idle' });
      return;
    }

    if (!await hasFfmpeg()) {
      await fail(owner, sessionId, 'Обработка аудио на сервере недоступна.');
      return;
    }

    const files = [];
    /* eslint-disable no-await-in-loop */
    for (const segment of segments) {
      const filename = path.basename(String(segment.url || ''));
      if (!ownsUpload(filename, owner)) continue;
      const file = path.join(uploadDir, filename);
      if (await readable(file)) files.push(file);
    }
    /* eslint-enable no-await-in-loop */

    if (!files.length) {
      await fail(owner, sessionId, 'Файлы записей не найдены.');
      return;
    }

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

    await transcribe(owner, sessionId, trackPath);
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
  }).select('owner sessionId voice.operationId voice.status');

  stuck.forEach((form) => {
    const operationId = form.voice && form.voice.operationId;
    setImmediate(() => {
      run(form.owner, form.sessionId, operationId || undefined).catch(() => {});
    });
  });

  return stuck.length;
};

module.exports = { run, enqueue, resume, orderedSegments };
