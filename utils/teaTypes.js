// Tea type labels as stored on the form, and the URL slug of each type's hub
// page (/blog/type/puer).
//
// MIRRORED IN THE FRONTEND at tea-taste-frontend/src/utils/teaTypes.js — the
// slugs are addresses on the public site, so the two lists have to name the
// same ten pages. `label` must stay byte-identical on both sides: it is what
// the feed query filters on, and a value that no longer matches returns an
// empty page rather than an error.

const teaTypeSlugs = [
  { slug: 'zelenyy-chay', short: 'Зелёный чай', label: 'Зелёный чай (绿茶 - Lǜ chá)' },
  { slug: 'belyy-chay', short: 'Белый чай', label: 'Белый чай (白茶 - Bái chá)' },
  { slug: 'zheltyy-chay', short: 'Жёлтый чай', label: 'Жёлтый чай (黄茶 - Huáng chá)' },
  { slug: 'ulun', short: 'Улун', label: 'Улун (乌龙茶 - Wūlóng chá)' },
  { slug: 'krasnyy-chay', short: 'Красный чай', label: 'Красный чай (红茶 - Hóng chá)' },
  { slug: 'chernyy-chay', short: 'Чёрный чай', label: 'Чёрный чай (黑茶 - Hēi chá)' },
  { slug: 'puer', short: 'Пуэр', label: 'Пуэр (普洱茶 - Pǔěr chá)' },
  { slug: 'travyanoy-chay', short: 'Травяной чай', label: 'Травяной чай (草药茶 - Cǎoyào chá)' },
  { slug: 'fruktovyy-chay', short: 'Фруктовый чай', label: 'Фруктовый чай (水果茶 - Shuǐguǒ chá)' },
  { slug: 'mate', short: 'Мате', label: 'Мате (马黛茶 - Mǎdài chá)' },
];

const teaTypeBySlug = (slug) => teaTypeSlugs.find((t) => t.slug === slug) || null;

module.exports = { teaTypeSlugs, teaTypeBySlug };
