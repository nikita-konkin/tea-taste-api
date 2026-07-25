const fs = require('fs');

// SpeechKit v3, deferred ("async") recognition. Sync recognition caps at 30
// seconds of audio, so a five-minute track has to go this way regardless.
//
// RecognizeFileRequest takes `oneof { bytes content; string uri }` — inline
// bytes are accepted, which is why no Object Storage bucket is involved. The
// older v2 longRunningRecognize would have required one.
const STT_URL = 'https://stt.api.cloud.yandex.net/stt/v3';
const OPERATION_URL = 'https://operation.api.cloud.yandex.net/operations';

const isConfigured = () => Boolean(process.env.YC_API_KEY && process.env.YC_FOLDER_ID);

const authHeaders = () => ({
  Authorization: `Api-Key ${process.env.YC_API_KEY}`,
  'x-folder-id': process.env.YC_FOLDER_ID,
});

const failure = (reason) => ({ ok: false, reason });

// Node 18 global fetch, same as utils/vkid.js.
const post = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SpeechKit ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
};

const get = async (url) => {
  const res = await fetch(url, { headers: authHeaders() });
  const text = await res.text();
  if (!res.ok) throw new Error(`SpeechKit ${res.status}: ${text.slice(0, 300)}`);
  return text;
};

// Submits the merged track and returns the operation id to poll.
const submit = async (mp3Path) => {
  if (!isConfigured()) return failure('SpeechKit не настроен (YC_API_KEY / YC_FOLDER_ID).');

  const content = (await fs.promises.readFile(mp3Path)).toString('base64');
  const json = await post(`${STT_URL}/recognizeFileAsync`, {
    content,
    recognitionModel: {
      audioFormat: { containerAudio: { containerAudioType: 'MP3' } },
      languageRestriction: { restrictionType: 'WHITELIST', languageCode: ['ru-RU'] },
      // literatureText rewrites spoken filler into readable prose, which both
      // the stored transcript and the field extraction benefit from.
      textNormalization: {
        textNormalization: 'TEXT_NORMALIZATION_ENABLED',
        literatureText: true,
        profanityFilter: false,
      },
    },
  });

  if (!json.id) return failure('SpeechKit не вернул идентификатор операции.');
  return { ok: true, operationId: json.id };
};

// Standard Yandex operation object: poll until done, then read the result.
const isDone = async (operationId) => {
  const json = JSON.parse(await get(`${OPERATION_URL}/${encodeURIComponent(operationId)}`));
  if (json.error) throw new Error(`SpeechKit operation error: ${json.error.message || 'unknown'}`);
  return Boolean(json.done);
};

// The REST mapping of a server-streaming RPC: a sequence of JSON objects, which
// arrives newline-delimited from this endpoint but is worth parsing either way.
const parseItems = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  try {
    const asJson = JSON.parse(trimmed);
    return Array.isArray(asJson) ? asJson : [asJson];
  } catch (err) {
    return trimmed.split('\n').map((line) => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
  }
};

// With normalization on, the same utterance is reported twice: once as `final`
// and again as `finalRefinement` carrying the normalized text. Concatenating
// everything would duplicate every sentence, so refinements win outright when
// any are present.
const extractTranscript = (items) => {
  const refined = [];
  const plain = [];

  items.forEach((item) => {
    const result = (item && item.result) || item || {};
    const refinement = result.finalRefinement
      && result.finalRefinement.normalizedText
      && result.finalRefinement.normalizedText.alternatives;
    const final = result.final && result.final.alternatives;

    if (refinement && refinement[0] && refinement[0].text) refined.push(refinement[0].text.trim());
    else if (final && final[0] && final[0].text) plain.push(final[0].text.trim());
  });

  return (refined.length ? refined : plain).filter(Boolean).join(' ').trim();
};

const fetchTranscript = async (operationId) => {
  const text = await get(`${STT_URL}/getRecognition?operationId=${encodeURIComponent(operationId)}`);
  return extractTranscript(parseItems(text));
};

// Best effort: leaving a finished recognition around is untidy but harmless.
const cleanup = (operationId) => fetch(
  `${STT_URL}/deleteRecognition?operationId=${encodeURIComponent(operationId)}`,
  { method: 'DELETE', headers: authHeaders() },
).catch(() => {});

module.exports = {
  isConfigured, submit, isDone, fetchTranscript, cleanup, extractTranscript, parseItems,
};
