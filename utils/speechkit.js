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
      // Pinned rather than left to the default. Measured on the same recording:
      // unset, `deferred-general` and `deferred-general:rc` returned byte-identical
      // results, so this is not a quality lever — it is a guard against the
      // default moving under us later. The stable one, not the release candidate:
      // :rc bought nothing here and is free to change without notice.
      model: 'deferred-general',
      audioFormat: { containerAudio: { containerAudioType: 'MP3' } },
      languageRestriction: { restrictionType: 'WHITELIST', languageCode: ['ru-RU'] },
      // Kept ON deliberately, and it is what produces the readable transcript
      // the user is shown. Do NOT turn it off to "fix" the numbers: it is also
      // what makes SpeechKit send the refinement alongside the raw final, and
      // extractRawTranscript below already keeps the unrewritten text for the
      // field extraction. Disabling it would lose the readable half and gain
      // nothing — see utils/extractForm.js for which half reads which.
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
// both would duplicate every sentence.
//
// Refinement is per utterance and optional — stt.proto says a FinalRefinement
// names the `final_index` it refines, and only sends one "for each final, if
// normalization is enabled". A short or low-confidence utterance can come back
// with no refinement at all while its neighbours have one.
//
// So the two are paired by that index. Letting refinements win *as a group* —
// what this did before — silently dropped every utterance that had none, and
// the survivors still read as fluent prose, so a transcript could lose its
// middle without looking damaged.
const extractTranscript = (items) => {
  const finals = [];
  const refined = new Map();

  items.forEach((item) => {
    const result = (item && item.result) || item || {};
    const refinement = result.finalRefinement;
    const normalized = refinement
      && refinement.normalizedText
      && refinement.normalizedText.alternatives;

    if (normalized && normalized[0] && normalized[0].text) {
      // proto3 JSON omits an int64 that is zero, so a missing index is the
      // first final rather than a malformed message.
      refined.set(Number(refinement.finalIndex || 0), normalized[0].text.trim());
      return;
    }

    const final = result.final && result.final.alternatives;
    if (final && final[0] && final[0].text) finals.push(final[0].text.trim());
  });

  // Refinements with nothing to pair against still have to yield their text:
  // that is the whole response when every utterance normalized cleanly.
  if (!finals.length) {
    return [...refined.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, text]) => text)
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  return finals
    .map((text, index) => (refined.has(index) ? refined.get(index) : text))
    .filter(Boolean)
    .join(' ')
    .trim();
};

// What the recogniser actually heard, before normalization rewrote it.
//
// Measured on a real recording: SpeechKit heard «пять с половиной грамм
// заварка» and the normalizer turned it into «5 15 Грамм заварка», from which
// the extraction stored a 15 g dose for a 5.5 g brew. Numbers spoken with units
// are exactly what a tasting is made of, so the text the field extraction reads
// must be the unrewritten one.
//
// Both arrive in the same response — the raw `final` and its `finalRefinement`
// — so keeping the pair costs nothing beyond a second string.
const extractRawTranscript = (items) => items
  .map((item) => {
    const result = (item && item.result) || item || {};
    const final = result.final && result.final.alternatives;
    return final && final[0] && final[0].text ? final[0].text.trim() : '';
  })
  .filter(Boolean)
  .join(' ')
  .trim();

// `text` is the readable transcript the user is shown; `raw` is what the field
// extraction reads. They are the same string when normalization returned
// nothing to refine.
const fetchTranscript = async (operationId) => {
  const body = await get(`${STT_URL}/getRecognition?operationId=${encodeURIComponent(operationId)}`);
  const items = parseItems(body);
  const text = extractTranscript(items);
  return { text, raw: extractRawTranscript(items) || text };
};

// Best effort: leaving a finished recognition around is untidy but harmless.
const cleanup = (operationId) => fetch(
  `${STT_URL}/deleteRecognition?operationId=${encodeURIComponent(operationId)}`,
  { method: 'DELETE', headers: authHeaders() },
).catch(() => {});

module.exports = {
  isConfigured,
  submit,
  isDone,
  fetchTranscript,
  cleanup,
  extractTranscript,
  extractRawTranscript,
  parseItems,
};
