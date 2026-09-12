// What a tasting *claims about itself* to anything that is not a browser: the
// search result snippet, the chat preview, the schema.org block.
//
// ─────────────────────────────────────────────────────────────────────────────
// MIRRORED FROM tea-taste-frontend/src/utils/formMeta.js. Change both.
//
// It cannot be one file: the frontend and the API are separate repositories
// with separate images, and sharing a module across them means publishing a
// package for eighty lines. The duplication is deliberate and narrow — only the
// derivation lives here, never the markup — because the two must agree. This
// copy is what a crawler is served by controllers/render.js; the other is what
// a reader's browser renders. A page that describes itself differently to each
// is the definition of cloaking.
//
// This file went stale once: it kept the pre-translation signatures while the
// frontend gained a `locale` argument, so render.js passed a language that was
// silently ignored and every translated page carried a Russian meta description
// beside its translated body. The API tests did not catch it because they
// asserted on the labels render.js builds itself. If you change one copy and
// not the other, that is the shape the bug takes.
// ─────────────────────────────────────────────────────────────────────────────

const {
  translate, pluralize, DEFAULT_LOCALE, LOCALE_TAG, PLURALS,
} = require('./locale');
const { teaTypeName } = require('./teaTypes');
const { translateOption } = require('./options');

const ORIGIN = process.env.FRONTEND_URL || 'https://teaform.ru';

// A value the form left empty. 'none' is a real stored value here, not a bug —
// the wizard writes it for skipped fields.
const filled = (value) => value !== undefined && value !== null && value !== '' && value !== 'none';

// What the page is actually about, in the order a reader would say it.
//
// The tea's name and the taster's own words stay exactly as written — only the
// scaffolding around them is translated. A description that translated the
// author's prose would be claiming they wrote something they did not.
const formSummary = (form, brewings = [], locale = DEFAULT_LOCALE) => [
  teaTypeName(form.type, locale),
  translateOption(form.country, locale),
  form.averageRating != null
    ? translate('meta.rating', locale, { n: form.averageRating })
    : '',
  brewings.length
    ? `${brewings.length} ${pluralize(brewings.length, locale, PLURALS.steeps[locale] || PLURALS.steeps[DEFAULT_LOCALE])}`
    : '',
  (brewings.find((b) => filled(b.description)) || {}).description,
].filter(Boolean).join(' · ');

const formDescription = (form, brewings = [], locale = DEFAULT_LOCALE) => {
  const summary = formSummary(form, brewings, locale);
  const head = translate('tasting.description', locale, { name: form.nameRU });
  return `${head}${summary ? `. ${summary}` : ''}`;
};

// Schema.org for the tasting itself. A dated, authored, rated write-up of a
// named product is a Review — the type search engines can actually show a
// rating for.
const formJsonLd = (form, previewUrl, locale = DEFAULT_LOCALE) => {
  const author = Array.isArray(form.owner) ? form.owner[0] : form.owner;
  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    name: form.nameRU,
    datePublished: form.createdAt,
    inLanguage: LOCALE_TAG[locale],
    itemReviewed: {
      '@type': 'Product',
      name: form.nameRU,
      category: teaTypeName(form.type, locale) || form.type,
      ...(form.country ? { countryOfOrigin: translateOption(form.country, locale) } : {}),
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
  ORIGIN, filled, formSummary, formDescription, formJsonLd, clamp,
};
