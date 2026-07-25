// YandexGPT 5.1 Pro. Same Api-Key auth as SpeechKit, so the two share a folder
// and a service account unless YC_GPT_* is set to point somewhere else.
const COMPLETION_URL = 'https://llm.api.cloud.yandex.net/foundationModels/v1/completion';

const key = () => process.env.YC_GPT_API_KEY || process.env.YC_API_KEY;
const folder = () => process.env.YC_GPT_FOLDER_ID || process.env.YC_FOLDER_ID;

const isConfigured = () => Boolean(key() && folder());

// "rc" is the 5.1 Pro channel; "latest" is the previous generation.
const modelUri = () => `gpt://${folder()}/yandexgpt/rc`;

// Structured output: the schema constrains the reply to exactly these keys, so
// the answer can be JSON.parse'd rather than scraped out of prose. Verified
// against the live API — both jsonSchema and json_schema name the same field.
const complete = async ({
  system, user, schema, maxTokens = 4000, temperature = 0,
}) => {
  if (!isConfigured()) {
    return { ok: false, reason: 'YandexGPT не настроен (YC_GPT_API_KEY / YC_GPT_FOLDER_ID).' };
  }

  const messages = [];
  if (system) messages.push({ role: 'system', text: system });
  messages.push({ role: 'user', text: user });

  const body = {
    modelUri: modelUri(),
    completionOptions: { stream: false, temperature, maxTokens: String(maxTokens) },
    messages,
  };
  if (schema) body.jsonSchema = { schema };

  const res = await fetch(COMPLETION_URL, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) return { ok: false, reason: `YandexGPT ${res.status}: ${text.slice(0, 300)}` };

  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, reason: 'YandexGPT вернул неразборчивый ответ.' };
  }

  const alternative = json.result && json.result.alternatives && json.result.alternatives[0];
  if (!alternative) return { ok: false, reason: 'YandexGPT не вернул вариантов ответа.' };

  // TRUNCATED_FINAL means maxTokens cut the reply off — the JSON is incomplete
  // and parsing it would silently drop the tail of the brewings array.
  if (String(alternative.status).includes('TRUNCATED')) {
    return { ok: false, reason: 'Ответ модели обрезан — не хватило maxTokens.' };
  }

  return {
    ok: true,
    text: (alternative.message && alternative.message.text) || '',
    usage: json.result.usage || {},
    modelVersion: json.result.modelVersion || '',
  };
};

module.exports = { complete, isConfigured, modelUri };
