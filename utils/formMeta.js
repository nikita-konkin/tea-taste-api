// What a tasting *claims about itself* to anything that is not a browser: the
// search result snippet, the chat preview, the schema.org block.
//
// ─────────────────────────────────────────────────────────────────────────────
// MIRRORED IN THE FRONTEND at tea-taste-frontend/src/utils/formMeta.js.
// Change both.
//
// It cannot be one file: the frontend and the API are separate repositories
// with separate images, and sharing a module across them means publishing a
// package for eighty lines. The duplication is deliberate and narrow — only the
// derivation lives here, never the markup — because the two must agree. This
// copy is what a crawler is served by controllers/render.js; the other is what
// a reader's browser renders. A page that describes itself differently to each
// is the definition of cloaking.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGIN = process.env.FRONTEND_URL || 'https://teaform.ru';

// Russian plural agreement: 1 пролив, 2 пролива, 5 проливов — and 11-14 take
// the last form regardless of their final digit.
const plural = (count, [one, few, many]) => {
  const n = Math.abs(Math.round(Number(count) || 0)) % 100;
  if (n >= 11 && n <= 14) return many;
  const last = n % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
};

// A value the form left empty. 'none' is a real stored value here, not a bug —
// the wizard writes it for skipped fields.
const filled = (value) => value !== undefined && value !== null && value !== '' && value !== 'none';

// What the page is actually about, in the order a reader would say it.
const formSummary = (form, brewings = []) => [
  form.type,
  form.country,
  form.averageRating != null ? `оценка ${form.averageRating}/10` : '',
  brewings.length
    ? `${brewings.length} ${plural(brewings.length, ['пролив', 'пролива', 'проливов'])}`
    : '',
  (brewings.find((b) => filled(b.description)) || {}).description,
].filter(Boolean).join(' · ');

const formDescription = (form, brewings = []) => {
  const summary = formSummary(form, brewings);
  return `Дегустация чая «${form.nameRU}»${summary ? `. ${summary}` : ''}`;
};

// Schema.org for the tasting itself. A dated, authored, rated write-up of a
// named product is a Review — the type search engines can actually show a
// rating for.
const formJsonLd = (form, brewings = [], previewUrl) => {
  const author = Array.isArray(form.owner) ? form.owner[0] : form.owner;
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    name: form.nameRU,
    datePublished: form.createdAt,
    inLanguage: 'ru-RU',
    itemReviewed: {
      '@type': 'Product',
      name: form.nameRU,
      category: form.type || 'Чай',
      ...(form.country ? { countryOfOrigin: form.country } : {}),
    },
    ...(author ? { author: { '@type': 'Person', name: author.nickname || author.name } } : {}),
    ...(form.averageRating != null ? {
      reviewRating: {
        '@type': 'Rating',
        ratingValue: form.averageRating,
        bestRating: 10,
        worstRating: 1,
      },
    } : {}),
    ...(previewUrl ? { image: `${ORIGIN}${previewUrl}` } : {}),
  };
};

// Trims a description to what a search result or a chat preview will actually
// show, without cutting a word in half. Mirrors PageMeta.jsx's clamp().
const clamp = (text, max = 160) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')) || cut}…`;
};

module.exports = {
  ORIGIN, plural, filled, formSummary, formDescription, formJsonLd, clamp,
};
