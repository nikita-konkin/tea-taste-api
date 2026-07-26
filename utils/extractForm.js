const AromaDB = require('../models/aromaDB');
const TasteDB = require('../models/tasteDB');
const { complete, isConfigured } = require('./yandexGpt');

// The picker joins levels with " → " and accepts an intermediate path, so the
// model is offered category → subcategory only. The full three-level tree would
// be several thousand tokens of prompt on every call for very little gain.
const SEP = ' → ';

const loadTree = async (Model) => {
  const rows = await Model.find({}).lean();
  return rows.map((row) => ({
    category: row.category,
    subcategories: (row.subcategories || []).map((sub) => sub.name),
    descriptors: (row.subcategories || []).reduce((acc, sub) => {
      acc[sub.name] = sub.descriptors || [];
      return acc;
    }, {}),
  }));
};

const renderTree = (tree) => tree
  .map(({ category, subcategories }) => `${category}: ${subcategories.join(', ')}`)
  .join('\n');

// Every path the picker can resolve: "Категория", "Категория → Подкатегория"
// and the full three-level form.
const validPaths = (tree) => {
  const set = new Set();
  tree.forEach(({ category, subcategories, descriptors }) => {
    set.add(category);
    subcategories.forEach((sub) => {
      set.add(`${category}${SEP}${sub}`);
      (descriptors[sub] || []).forEach((d) => set.add(`${category}${SEP}${sub}${SEP}${d}`));
    });
  });
  return set;
};

// A JSON schema constrains the shape but cannot enumerate a tree this size, so
// the model can return a plausible path that does not exist. Anything unknown is
// dropped rather than passed on to a picker that would fail to resolve it.
const keepKnown = (paths, known) => {
  const kept = [];
  const dropped = [];
  (paths || []).forEach((raw) => {
    const path = String(raw).replace(/\s*(→|->|\/|>)\s*/g, SEP).trim();
    if (known.has(path)) kept.push(path);
    else dropped.push(raw);
  });
  return { kept, dropped };
};

// YandexGPT's structured output is strict: every property must be listed in
// `required` ("Invalid JSON Schema: all fields must be required"). Optionality
// is therefore expressed as a nullable type, and nulls are stripped below — the
// alternative, forcing a value for every field, would push the model into
// inventing a price or a temperature nobody said out loud.
const nullable = (type, description) => ({ type: [type, 'null'], description });

const BREWING_PROPS = {
  number: nullable('number', 'Номер пролива, начиная с 1'),
  description: nullable('string', 'Впечатление от этого пролива словами говорящего'),
  time: nullable('number', 'Время выдержки в секундах, если названо'),
  rating: nullable('number', 'Оценка от 1 до 10, только если она прозвучала'),
  aromas: {
    type: ['array', 'null'],
    items: { type: 'string' },
    description: 'Пути из справочника ароматов',
  },
  tastes: {
    type: ['array', 'null'],
    items: { type: 'string' },
    description: 'Пути из справочника вкусов',
  },
};

const FORM_PROPS = {
  nameRU: nullable('string', 'Название чая'),
  type: nullable('string', 'Вид чая: Шэн пуэр, Шу пуэр, Улун, Красный, Зелёный, Белый и т.п.'),
  country: nullable('string', 'Страна происхождения'),
  shop: nullable('string', 'Магазин или продавец'),
  weight: nullable('number', 'Навеска сухого листа в граммах'),
  volume: nullable('number', 'Объём воды на пролив в миллилитрах'),
  temperature: nullable('number', 'Температура воды в градусах'),
  price: nullable('number', 'Цена всей покупки в рублях'),
  water: nullable('string', 'Какая вода использовалась'),
  teaware: nullable('string', 'Посуда: гайвань, чайник из глины и т.п.'),
  brewingtype: nullable('string', 'Способ заваривания, например Проливы'),
  brewings: {
    type: 'array',
    description: 'По одному объекту на каждый пролив, в порядке номеров',
    items: { type: 'object', properties: BREWING_PROPS, required: Object.keys(BREWING_PROPS) },
  },
};

// The prompt tells the model to describe any note it cannot express as a path,
// and on real recordings it does. This is the backstop for when it does not:
// «иван-чай» and «помидор» were both named out loud on a test tasting and are
// both absent from the taxonomy, so without this they would simply disappear.
//
// Only appends what the description does not already say, since the model usually
// mentions them itself and repeating the words reads as a bug.
const withUnmatched = (description, dropped) => {
  const text = String(description || '').trim();
  if (!dropped.length) return text;

  const lower = text.toLowerCase();
  const missing = [...new Set(dropped
    .map((path) => String(path).split(/\s*(?:→|->|\/|>)\s*/).pop().trim())
    .filter((word) => word && !lower.includes(word.toLowerCase())))];

  if (!missing.length) return text;
  const tail = `Также прозвучало: ${missing.join(', ')}.`;
  return text ? `${text} ${tail}` : tail;
};

const FORM_SCHEMA = {
  type: 'object',
  properties: FORM_PROPS,
  required: Object.keys(FORM_PROPS),
};

// null means "not mentioned"; the caller should not have to distinguish that
// from an empty string when deciding whether to offer a field to the user.
const stripEmpty = (obj) => Object.entries(obj).reduce((acc, [key, value]) => {
  if (value === null || value === undefined || value === '') return acc;
  if (Array.isArray(value) && !value.length) return acc;
  acc[key] = value;
  return acc;
}, {});

const systemPrompt = (aromaTree, tasteTree) => `Ты помогаешь заполнить дневник чайной дегустации по расшифровке аудиозаписи.

Расшифровка сделана автоматически: в ней есть ошибки распознавания, оборванные фразы, разговорная речь и посторонние темы, не связанные с чаем. Посторонние фрагменты игнорируй.

Правила:
1. Заполняй только то, что действительно прозвучало. Если данных нет — ставь null, не придумывай.
2. Исправляй очевидные ошибки распознавания в названиях чая ("Шэньпээр" → "Шэн пуэр").
3. Проливы нумеруй по порядку так, как их называет говорящий.
4. В description каждого пролива — короткое описание впечатления словами говорящего.
5. Ароматы и вкусы указывай ТОЛЬКО путями из справочников ниже, через " → ". Разрешён неполный путь ("Древесный" или "Древесный → Кора").
6. Если для прозвучавшего оттенка подходящего пути в справочнике НЕТ — не выдумывай путь, а обязательно опиши этот оттенок словами в description этого пролива. Ни один названный оттенок не должен потеряться.

Числа легко перепутать, поэтому отдельно:
- weight — сколько грамм СУХОГО ЛИСТА положили в чайник для этой дегустации (обычно 4–10 г). Это НЕ вес купленной упаковки.
- volume — сколько миллилитров ВОДЫ наливают на один пролив (обычно 50–200 мл). Это НЕ объём чайника и НЕ навеска.
- price — цена ВСЕЙ покупки в рублях. Если названа цена за грамм и вес упаковки — перемножь и верни итог, а не цену за грамм.
- country — СТРАНА (например, "Китай"). Вэньшань, Юньнань, Иу — это регионы, а не страны; страну выведи из региона.
- nameRU — как чай назвали бы на этикетке: вид, происхождение, год, форма прессовки, если они прозвучали.

СПРАВОЧНИК АРОМАТОВ (категория: подкатегории):
${aromaTree}

СПРАВОЧНИК ВКУСОВ (категория: подкатегории):
${tasteTree}`;

const extractFromTranscript = async (transcript) => {
  if (!isConfigured()) return { ok: false, reason: 'YandexGPT не настроен.' };
  if (!transcript || !transcript.trim()) return { ok: false, reason: 'Пустая расшифровка.' };

  const [aromas, tastes] = await Promise.all([loadTree(AromaDB), loadTree(TasteDB)]);
  const knownAromas = validPaths(aromas);
  const knownTastes = validPaths(tastes);

  const answer = await complete({
    system: systemPrompt(renderTree(aromas), renderTree(tastes)),
    user: `Расшифровка записи дегустации:\n\n${transcript}`,
    schema: FORM_SCHEMA,
    maxTokens: 8000,
  });
  if (!answer.ok) return answer;

  let data;
  try {
    data = JSON.parse(answer.text);
  } catch (err) {
    return { ok: false, reason: 'Модель вернула не JSON.' };
  }

  const droppedPaths = [];
  const brewings = (data.brewings || []).map((brewing) => {
    const a = keepKnown(brewing.aromas, knownAromas);
    const t = keepKnown(brewing.tastes, knownTastes);
    droppedPaths.push(...a.dropped, ...t.dropped);
    return stripEmpty({
      ...brewing,
      description: withUnmatched(brewing.description, [...a.dropped, ...t.dropped]),
      aromas: a.kept,
      tastes: t.kept,
    });
  });

  return {
    ok: true,
    data: { ...stripEmpty(data), brewings },
    droppedPaths,
    usage: answer.usage,
    modelVersion: answer.modelVersion,
  };
};

module.exports = { extractFromTranscript, FORM_SCHEMA, keepKnown, validPaths, loadTree };
