const AromaDB = require('../models/aromaDB');
const TasteDB = require('../models/tasteDB');
const { complete, isConfigured } = require('./yandexGpt');
const { teaTypeLabels } = require('./teaTypes');
const { TEAWARE, BREWING } = require('./options');

// The vocabularies the wizard's own dropdowns are built from. SpeechKit has no
// phrase hints or custom dictionary — stt.proto offers language_restriction and
// nothing else — so a general model has never heard «шу пуэр», «гайвань» or
// «пролив» in this sense and reliably mangles them: one real recording came back
// with «шпу» for «шу пуэр» and «в гайв в гайване» for «в гайване».
//
// Repairing them is therefore this layer's job, and it already half does it
// unaided — it read «гайвань» out of «в Гайв в Гайване» on that same recording.
// Given the actual lists it can do the rest, and it snaps a mangled value onto a
// string the form's dropdowns already know rather than inventing a near-miss.
//
// Only the short, closed lists are worth the tokens. Water brands, shops and tea
// names are open sets — a new shop or a tea nobody has logged before must still
// come through as whatever was said.
const known = (labels) => labels.map((label) => `- ${label}`).join('\n');

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
  // The tea as a whole, and the dry leaf — both are talked about before the
  // first pour and had nowhere to go, so everything said about them used to be
  // folded into пролив №1 or lost.
  description: nullable('string', 'Общее впечатление о чае в целом, словами говорящего'),
  dryAroma: {
    type: ['array', 'null'],
    items: { type: 'string' },
    description: 'Пути из справочника ароматов для запаха СУХОГО листа, до заваривания',
  },
  dryAromaDescription: nullable('string', 'Аромат сухого листа словами говорящего'),
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
3. Если строка расшифровки начинается с пометки «[Пролив N]» — это номер, который поставил САМ ПОЛЬЗОВАТЕЛЬ, записывая заметку прямо в этом проливе. Он ТОЧНЫЙ. Бери number строго из пометки, не перенумеровывай, не сдвигай и НИКОГДА не сливай два помеченных пролива в один: сколько разных номеров в пометках — столько объектов в brewings. Говорящий обычно не произносит номер вслух, и это нормально. Если пометок нет вовсе — тогда нумеруй по порядку так, как называет говорящий.
4. В description каждого пролива — короткое описание впечатления словами говорящего.
5. Ароматы и вкусы указывай ТОЛЬКО путями из справочников ниже, через " → ". Разрешён неполный путь ("Древесный" или "Древесный → Кора").
6. Если для прозвучавшего оттенка подходящего пути в справочнике НЕТ — не выдумывай путь, а обязательно опиши этот оттенок словами в description этого пролива. Ни один названный оттенок не должен потеряться.
7. Не используй категорию «Другое»: она ничего не сообщает. Нет подходящего пути — пиши словами в description.
8. Не указывай одновременно категорию и её подкатегорию: «Овощной → Томат» уже включает «Овощной».
9. Выбирай САМЫЙ ТОЧНЫЙ путь из справочника, а не общую категорию: «аромат коры дуба» — это «Древесный → Дуб», а не просто «Древесный»; «пахнет мятой» — «Травяной → Мята». Общую категорию бери только тогда, когда точнее в справочнике нет.
10. Вид чая (type) почти всегда назван вслух — «тип чая красный», «зелёный», «шэн пуэр» — но распознавание часто рвёт эту фразу на куски. Всё равно найди его и заполни.
11. topic заполняй ТОЛЬКО когда isTeaTasting: false. Если запись о чае — оставь topic пустым.
12. Если про пролив сказано «аналогичен предыдущему» — повтори для него ароматы и вкусы предыдущего пролива, а в description отметь, чем он отличается.
13. Аромат СУХОГО листа (его нюхают до заваривания, часто прямо из пакета или прогретой гайвани) — это dryAroma и dryAromaDescription, а НЕ аромат первого пролива. Не путай их.
14. description — общее впечатление о чае ЦЕЛИКОМ: стоит ли он своих денег, на что похож, кому подойдёт. Заполняй его только из заметки с пометкой «[О чае]» или из прямого итога («в целом чай…», «в итоге…»). Впечатления от конкретных проливов туда не переноси и НЕ ПЕРЕСКАЗЫВАЙ их своими словами: каждое такое впечатление принадлежит своему проливу. Если общей заметки нет и итога не прозвучало — оставь description пустым.
15. Если запись вообще не о дегустации чая (разговор, список дел, что угодно другое) — верни isTeaTasting: false, в topic коротко напиши, о чём запись, а все остальные поля оставь пустыми и brewings пустым массивом. Лучше честно ничего не заполнить, чем выдумать.

Числа в расшифровке обычно записаны СЛОВАМИ, знаков препинания и заглавных букв может не быть — так и задумано:
- «пять с половиной грамм» — это 5.5, а не 5 и не 15. Дроби («с половиной», «с четвертью») сохраняй.
- «девяносто градусов» рядом со словом «температура» — это температура воды в °C. Голое число возле «температура» — всегда градусы Цельсия, никогда не проценты.
- В старых записях числа мог переписать нормализатор, и он ошибался: «пять с половиной грамм» превращалось в «5 15 Грамм», «девяносто градусов» — в «90% 2 р.». Увидел такую нелепицу — доверяй словам вокруг, а не цифрам, и ставь null, если понять невозможно.

Числа легко перепутать, поэтому отдельно:
- weight — сколько грамм СУХОГО ЛИСТА положили в чайник для этой дегустации (обычно 4–10 г). Это НЕ вес купленной упаковки.
- volume — сколько миллилитров ВОДЫ наливают на один пролив (обычно 50–200 мл). Это НЕ объём чайника и НЕ навеска.
- price — цена ВСЕЙ покупки в рублях. Если названа цена за грамм и вес упаковки — перемножь и верни итог, а не цену за грамм.
- temperature — температура ВОДЫ в градусах Цельсия (обычно 60–100).
- country — СТРАНА (например, "Китай"). Вэньшань, Юньнань, Иу — это регионы, а не страны; страну выведи из региона.
- nameRU — как чай назвали бы на этикетке: вид, происхождение, год, форма прессовки, если они прозвучали. Если говорящий прямо сказал «название …», «называется …» — то, что идёт СЛЕДОМ, обязано попасть в nameRU, даже если распознано криво и не похоже ни на один известный чай. Кривое название пользователь исправит одним касанием; пропавшего он не заметит. Название — не то же самое, что вид чая: «шпу название неокур» — это type «пуэр» И nameRU «неокур», а не только type.

ВИДЫ ЧАЯ — если прозвучал вид чая, верни в type ТОЧНО одну из этих строк, целиком, вместе со скобками:
${known(teaTypeLabels)}
Распознавание часто рвёт вид чая на куски: «шпу», «шу пу», «шэн пу эр» — это пуэр; «улунчик», «улон» — улун. Восстанавливай.

ПОСУДА — если прозвучала посуда, верни в teaware ТОЧНО одну из этих строк:
${known(Object.keys(TEAWARE))}
«гайв», «гайвана», «гайване» — это Гайвань.

СПОСОБЫ ЗАВАРИВАНИЯ — если прозвучал способ, верни в brewingtype ТОЧНО одну из этих строк:
${known(Object.keys(BREWING))}
«проливы», «по-китайски», «гунфу» — это «Проливы (по-китайски)»; «настаивание», «по-европейски» — «Настаивание (по-европейски)».

Если прозвучавшее значение НЕ похоже ни на одну строку из списка — верни его словами говорящего, не подгоняй силой.

СПРАВОЧНИК АРОМАТОВ (категория: подкатегории):
${aromaTree}

СПРАВОЧНИК ВКУСОВ (категория: подкатегории):
${tasteTree}`;

// The transcript as the model should see it.
//
// A plain string is one undivided recording and passes through as it always
// did. An array is one entry per пролив, and every line is labelled with the
// number the USER gave it by recording inside that пролив — which the model
// could never recover from the words alone, because a taster does not announce
// "пролив four" before describing it.
const userText = (source) => {
  if (!Array.isArray(source)) return `Расшифровка записи дегустации:\n\n${source}`;

  const lines = source.map(({ brewingNumber, transcript }) => (
    Number(brewingNumber) > 0
      ? `[Пролив ${Number(brewingNumber)}] ${transcript}`
      : `[О чае] ${transcript}`
  ));

  return 'Расшифровка записи дегустации. Каждая строка — отдельная заметка, записанная в момент своего пролива; '
    + `номер в квадратных скобках проставил сам пользователь и он ТОЧЕН:\n\n${lines.join('\n')}`;
};

const isEmptySource = (source) => (Array.isArray(source)
  ? !source.some((part) => part && String(part.transcript || '').trim())
  : !source || !String(source).trim());

// `source` is either the whole transcript as one string, or [{brewingNumber,
// transcript}] — one entry per пролив, which is what recognition now produces.
const extractFromTranscript = async (source) => {
  if (!isConfigured()) return { ok: false, reason: 'YandexGPT не настроен.' };
  if (isEmptySource(source)) return { ok: false, reason: 'Пустая расшифровка.' };

  const [aromas, tastes] = await Promise.all([loadTree(AromaDB), loadTree(TasteDB)]);
  const knownAromas = validPaths(aromas);
  const knownTastes = validPaths(tastes);

  const answer = await complete({
    system: systemPrompt(renderTree(aromas), renderTree(tastes)),
    user: userText(source),
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

  // Same treatment as a пролив's aromas: resolved against the dictionary, and
  // whatever it cannot place is spelled out in the free-text field rather than
  // dropped on the floor.
  const dry = keepKnown(data.dryAroma, knownAromas);
  droppedPaths.push(...dry.dropped);

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

  // Both dry-leaf keys are replaced wholesale by the resolved versions below,
  // so the model's raw ones must not survive the spread — an unresolved path
  // that keepKnown rejected would otherwise come back through the first half.
  const { dryAroma, dryAromaDescription, ...rest } = stripEmpty(data);

  return {
    ok: true,
    data: {
      ...rest,
      ...stripEmpty({
        dryAroma: dry.kept,
        dryAromaDescription: withUnmatched(data.dryAromaDescription, dry.dropped),
      }),
      brewings,
    },
    droppedPaths,
    usage: answer.usage,
    modelVersion: answer.modelVersion,
  };
};

module.exports = {
  extractFromTranscript, FORM_SCHEMA, keepKnown, validPaths, loadTree, userText,
};
