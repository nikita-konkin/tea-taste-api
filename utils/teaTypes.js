// Tea type labels as stored in the DB (same list as the Stage-1 selector).
//
// MIRRORED FROM tea-taste-frontend/src/utils/teaTypes.js. Change both: the
// slugs are public addresses and the labels are database keys, so the app and
// the crawler HTML have to agree on both.
//
// These strings are stored verbatim on every tasting and are what the feed
// endpoint filters on — they are keys, not copy, and must never be edited.
// Display names per language live in `teaTypeSlugs` below.
const teaTypeLabels = [
	'Зелёный чай (绿茶 - Lǜ chá)',
	'Белый чай (白茶 - Bái chá)',
	'Жёлтый чай (黄茶 - Huáng chá)',
	'Улун (乌龙茶 - Wūlóng chá)',
	'Красный чай (红茶 - Hóng chá)',
	'Чёрный чай (黑茶 - Hēi chá)',
	'Пуэр (普洱茶 - Pǔěr chá)',
	'Травяной чай (草药茶 - Cǎoyào chá)',
	'Фруктовый чай (水果茶 - Shuǐguǒ chá)',
	'Мате (马黛茶 - Mǎdài chá)',
];

// URL slug and display name per language, for /blog/type/:slug.
//
// Declared rather than derived: the stored labels carry Chinese and pinyin, so
// transliterating them produces neither a usable slug nor a readable heading.
// `label` must stay byte-identical to the list above — it is what the feed
// endpoint filters on (`?type=`), and a stored value that no longer matches
// silently returns an empty page rather than an error.
//
// The Chinese names need no translating: they are the ones already inside each
// label, because the vocabulary was Chinese to begin with. English follows the
// same Chinese convention the site already uses — 红茶 is "red tea" here and
// 黑茶 "dark tea", which is what a tea drinker expects even though a
// supermarket would call the first of those "black tea".
const teaTypeSlugs = [
	{ slug: 'zelenyy-chay', label: teaTypeLabels[0], ru: 'Зелёный чай', en: 'Green tea', zh: '绿茶' },
	{ slug: 'belyy-chay', label: teaTypeLabels[1], ru: 'Белый чай', en: 'White tea', zh: '白茶' },
	{ slug: 'zheltyy-chay', label: teaTypeLabels[2], ru: 'Жёлтый чай', en: 'Yellow tea', zh: '黄茶' },
	{ slug: 'ulun', label: teaTypeLabels[3], ru: 'Улун', en: 'Oolong', zh: '乌龙茶' },
	{ slug: 'krasnyy-chay', label: teaTypeLabels[4], ru: 'Красный чай', en: 'Red tea', zh: '红茶' },
	{ slug: 'chernyy-chay', label: teaTypeLabels[5], ru: 'Чёрный чай', en: 'Dark tea', zh: '黑茶' },
	{ slug: 'puer', label: teaTypeLabels[6], ru: 'Пуэр', en: 'Pu-erh', zh: '普洱茶' },
	{ slug: 'travyanoy-chay', label: teaTypeLabels[7], ru: 'Травяной чай', en: 'Herbal tea', zh: '草药茶' },
	{ slug: 'fruktovyy-chay', label: teaTypeLabels[8], ru: 'Фруктовый чай', en: 'Fruit tea', zh: '水果茶' },
	{ slug: 'mate', label: teaTypeLabels[9], ru: 'Мате', en: 'Maté', zh: '马黛茶' },
];

const teaTypeBySlug = (slug) =>
	teaTypeSlugs.find((t) => t.slug === slug) || null;

const teaTypeByLabel = (label) =>
	teaTypeSlugs.find((t) => t.label === label) || null;

// Display name for a type entry in one language.
const teaTypeShort = (type, locale = 'ru') =>
	(type && (type[locale] || type.ru)) || '';

// Display name for a *stored* label. Falls back to the stored string, so a type
// added to the wizard but not to this list still reads sensibly rather than
// disappearing.
const teaTypeName = (label, locale = 'ru') => {
	const type = teaTypeByLabel(label);
	return type ? teaTypeShort(type, locale) : label;
};

module.exports = {
  teaTypeLabels, teaTypeSlugs, teaTypeBySlug, teaTypeByLabel, teaTypeShort, teaTypeName,
};
