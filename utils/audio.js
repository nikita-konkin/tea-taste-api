const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Always execFile with an argument array, never exec with an interpolated
// string: these paths are server-generated today, but a shell in the loop is
// the kind of thing that stops being safe when someone changes the caller.
const run = (bin, args, timeout) => new Promise((resolve, reject) => {
  execFile(bin, args, { timeout: timeout || 60000, windowsHide: true }, (err, stdout, stderr) => {
    if (err) {
      const detail = String(stderr || err.message || '').trim().slice(-400);
      const e = new Error(`${bin}: ${detail || 'не удалось выполнить'}`);
      e.cause = err;
      return reject(e);
    }
    return resolve(String(stdout));
  });
});

// Seconds, one decimal. Returns 0 rather than throwing for a file ffprobe
// cannot read: callers treat 0 as "unknown length", not as an error.
const probeDuration = (file) => run('ffprobe', [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'csv=p=0',
  file,
]).then((out) => {
  const seconds = Number.parseFloat(String(out).trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 10) / 10 : 0;
}).catch(() => 0);

// Mono 16 kHz mp3 is the one format that is both on SpeechKit's accepted list
// (WAV | OGG_OPUS | MP3 — see stt.proto ContainerAudioType) and playable in a
// plain <audio> element everywhere: WAV is far too big to serve, and Safari's
// Ogg support cannot be relied on. 16 kHz is all a speech model uses.
const MP3_ARGS = ['-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k'];

// Transcodes an uploaded recording in place: <name>.webm -> <name>.mp3, with
// the original removed. Encoding to a temp file first means an input that is
// already .mp3 (a file the user picked rather than recorded) does not have
// ffmpeg reading and writing the same path.
const normalizeToMp3 = async (inPath) => {
  const base = inPath.replace(/\.[^.\\/]+$/, '');
  const target = `${base}.mp3`;
  const tmp = `${base}.tmp.mp3`;

  try {
    await run('ffmpeg', ['-y', '-i', inPath, ...MP3_ARGS, tmp], 120000);
  } catch (err) {
    await fs.promises.unlink(tmp).catch(() => {});
    throw err;
  }

  await fs.promises.unlink(inPath).catch(() => {});
  await fs.promises.rename(tmp, target);

  return { path: target, filename: path.basename(target), duration: await probeDuration(target) };
};

// Joins the per-пролив segments into the single soundtrack. Re-encoded rather
// than stream-copied: concatenated mp3 frames play, but the container's
// duration metadata ends up describing only the first input, and that number is
// what the player's seek bar and the 5-minute check both read.
const concatMp3 = async (files, outPath) => {
  const listPath = path.join(
    os.tmpdir(),
    `tea-concat-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
  );
  const body = files
    .map((file) => `file '${path.resolve(file).replace(/'/g, "'\\''")}'`)
    .join('\n');

  await fs.promises.writeFile(listPath, `${body}\n`, 'utf8');
  try {
    await run(
      'ffmpeg',
      ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, ...MP3_ARGS, outPath],
      300000,
    );
  } finally {
    await fs.promises.unlink(listPath).catch(() => {});
  }

  return { path: outPath, filename: path.basename(outPath), duration: await probeDuration(outPath) };
};

// Pauses, throat-clearing and dead air are billed by SpeechKit exactly like
// speech is — recognition is priced per 15 seconds of audio, so removing silence
// is a straight discount with no effect on the words. On a real 35-minute
// ceremony this cut 46% of the length.
//
// Deliberately NOT applied to the stored track: the user plays that back, and a
// de-silenced recording sounds clipped and rushed. Only the copy handed to the
// recogniser is squeezed, and it is deleted afterwards.
//
// -35 dB with a 0.7 s guard keeps word endings intact. If the result comes back
// implausibly short — a quiet recording where the threshold ate actual speech —
// the original is used instead, because paying for a few extra blocks is much
// cheaper than a transcript with holes in it.
const squeezeForRecognition = async (inPath) => {
  const outPath = `${inPath.replace(/\.[^.\\/]+$/, '')}.squeezed.mp3`;
  const before = await probeDuration(inPath);

  try {
    await run('ffmpeg', [
      '-y', '-i', inPath,
      '-af', 'silenceremove=start_periods=1:start_duration=0.2:start_threshold=-35dB'
           + ':stop_periods=-1:stop_duration=0.7:stop_threshold=-35dB',
      ...MP3_ARGS, outPath,
    ], 180000);
  } catch (err) {
    return { path: inPath, squeezed: false, before, after: before };
  }

  const after = await probeDuration(outPath);
  if (!after || (before && after < before * 0.35)) {
    await fs.promises.unlink(outPath).catch(() => {});
    return { path: inPath, squeezed: false, before, after: before };
  }

  return { path: outPath, squeezed: true, before, after };
};

// Probed once and cached. Used to log a clear warning at startup instead of
// letting the first voice upload fail with a raw ENOENT from execFile.
let ffmpegReady = null;
const hasFfmpeg = () => {
  if (ffmpegReady === null) {
    ffmpegReady = run('ffmpeg', ['-version'], 10000).then(() => true).catch(() => false);
  }
  return ffmpegReady;
};

module.exports = {
  probeDuration,
  normalizeToMp3,
  concatMp3,
  squeezeForRecognition,
  hasFfmpeg,
  MAX_TRACK_SECONDS: 300,
};
