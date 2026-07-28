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
// Speech, the model and the dictionary spell things differently: «Спиртовой
// оттенок» against «Спиртовой», «ё» against «е», stray punctuation. Comparing
// letters and digits only makes those the same word.
const norm = (text) => String(text || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9]+/gi, '');

// Two lookups over the vocabulary: the whole path, and each path's final
// segment. The second is what rescues a near-miss — the model reliably names the
// right descriptor and guesses the wrong branch above it.
const buildIndex = (known) => {
  const byPath = new Map();
  const byLeaf = new Map();
  known.forEach((path) => {
    byPath.set(norm(path), path);
    const leaf = norm(path.split(SEP).pop());
    // First writer wins, so the answer for a given word never depends on Set
    // iteration order.
    if (leaf && !byLeaf.has(leaf)) byLeaf.set(leaf, path);
  });
  return { byPath, byLeaf };
};

// Resolves whatever the model produced to a real entry rather than only
// accepting an exact hit. A descriptor that lands in the wrong category is worth
// keeping — the word was genuinely said out loud — and the vocabulary decides
// where it belongs.
const resolvePath = (raw, index) => {
  const path = String(raw).replace(/\s*(→|->|\/|>)\s*/g, SEP).trim();
  if (!path) return null;

  const exact = index.byPath.get(norm(path));
  if (exact) return exact;

  // Deepest segment first: it carries the most meaning, and the branch above it
  // is what the model tends to get wrong.
  const segments = path.split(SEP).map((s) => s.trim()).filter(Boolean).reverse();
  for (const segment of segments) {
    // Never resolve onto the catch-all. "Другое → Спиртовой оттенок" would
    // otherwise match on its "Другое" half and be discarded as meaningless,
    // losing the descriptor entirely instead of letting it fall through to the
    // пролив description.
    if (CATCH_ALL.has(norm(segment))) continue;
    const hit = index.byLeaf.get(norm(segment));
    if (hit && !CATCH_ALL.has(norm(hit))) return hit;
  }
  return null;
};

// "Другое" is a real category, so it resolves — but as a descriptor it says
// nothing, and it would appear on most tastings once resolution stopped dropping
// near-misses. Discarded outright rather than pushed to `dropped`: «Также
// прозвучало: Другое» in the description would be worse than losing it.
const CATCH_ALL = new Set([norm('Другое')]);

const keepKnown = (paths, known) => {
  const index = buildIndex(known);
  const kept = [];
  const dropped = [];

  (paths || []).forEach((raw) => {
    const resolved = resolvePath(raw, index);
    if (!resolved) {
      dropped.push(raw);
      return;
    }
    if (CATCH_ALL.has(norm(resolved))) return;
    if (!kept.includes(resolved)) kept.push(resolved);
  });

  // A parent is implied by its own child, so "Овощной" alongside
  // "Овощной → Томат" is noise. Keeps only the paths nothing else extends.
  const specific = kept.filter(
    (path) => !kept.some((other) => other !== path && other.startsWith(`${path}${SEP}`)),
  );

  return { kept: specific, dropped };
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
  // Asked of the model rather than guessed at afterwards, and it costs nothing:
  // two more fields on a call that was happening anyway. Without it an off-topic
  // recording is silently mined for tea data and the form fills with invention.
  isTeaTasting: nullable('boolean', 'true, если запись действительно о дегустации чая'),
  topic: nullable('string', 'Если запись не о чае — коротко, о чём она на самом деле'),
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
  if (!text) return tail;
  // The model rarely ends its description with punctuation, so without this the
  // two run together: «вкус стал более молочный Также прозвучало: …».
  const separator = /[.!?…]$/.test(text) ? ' ' : '. ';
  return `${text}${separator}${tail}`;
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
7. Не используй категорию «Другое»: она ничего не сообщает. Нет подходящего пути — пиши словами в description.
8. Не указывай одновременно категорию и её подкатегорию: «Овощной → Томат» уже включает «Овощной».
9. Выбирай САМЫЙ ТОЧНЫЙ путь из справочника, а не общую категорию: «аромат коры дуба» — это «Древесный → Дуб», а не просто «Древесный»; «пахнет мятой» — «Травяной → Мята». Общую категорию бери только тогда, когда точнее в справочнике нет.
10. Вид чая (type) почти всегда назван вслух — «тип чая красный», «зелёный», «шэн пуэр» — но распознавание часто рвёт эту фразу на куски. Всё равно найди его и заполни.
11. topic заполняй ТОЛЬКО когда isTeaTasting: false. Если запись о чае — оставь topic пустым.
12. Если про пролив сказано «аналогичен предыдущему» — повтори для него ароматы и вкусы предыдущего пролива, а в description отметь, чем он отличается.
13. Если запись вообще не о дегустации чая (разговор, список дел, что угодно другое) — верни isTeaTasting: false, в topic коротко напиши, о чём запись, а все остальные поля оставь пустыми и brewings пустым массивом. Лучше честно ничего не заполнить, чем выдумать.

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

  // Nothing is offered rather than a form filled from the wrong material. The
  // transcript is still kept — it is the user's recording either way.
  if (data.isTeaTasting === false) {
    return {
      ok: true,
      offTopic: true,
      topic: (data.topic || '').trim(),
      data: { brewings: [] },
      droppedPaths: [],
      usage: answer.usage,
      modelVersion: answer.modelVersion,
    };
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
