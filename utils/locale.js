// Locale helpers for the crawler renderer.
//
// MIRRORED FROM tea-taste-frontend/src/i18n/index.js — the same three
// languages, the same path prefixes, the same rules. The app and the HTML a
// crawler is served have to agree on what URL a page lives at, or the canonical
// in the rendered copy points somewhere the app never renders.

const { messages, PLURALS } = require('./messages');

const LOCALES = ['ru', 'en', 'zh'];
const DEFAULT_LOCALE = 'ru';
const LOCALE_PREFIX = { ru: '', en: '/en', zh: '/zh' };
const LOCALE_TAG = { ru: 'ru', en: 'en', zh: 'zh-Hans' };
const OG_LOCALE = { ru: 'ru_RU', en: 'en_US', zh: 'zh_CN' };

const localeFromPath = (pathname) => {
  const first = String(pathname || '').split('/')[1];
  return LOCALES.find((l) => l !== DEFAULT_LOCALE && l === first) || DEFAULT_LOCALE;
};

const stripLocale = (pathname) => {
  const locale = localeFromPath(pathname);
  if (locale === DEFAULT_LOCALE) return pathname || '/';
  return pathname.slice(LOCALE_PREFIX[locale].length) || '/';
};

// '/' under a prefix is '/en', never '/en/' — one address per page.
const localizePath = (pathname, locale) => {
  const bare = stripLocale(pathname);
  const prefix = LOCALE_PREFIX[locale] || '';
  if (bare === '/') return prefix || '/';
  return `${prefix}${bare}`;
};

const translate = (key, locale, vars) => {
  const table = messages[locale] || messages[DEFAULT_LOCALE];
  let text = table[key];
  if (text === undefined) text = messages[DEFAULT_LOCALE][key];
  if (text === undefined) return key;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    text,
  );
};

const pluralize = (count, locale, forms) => {
  if (locale === 'zh') return forms.one;
  if (locale === 'en') return count === 1 ? forms.one : forms.many;
  const n = Math.abs(Math.round(Number(count) || 0)) % 100;
  if (n >= 11 && n <= 14) return forms.many;
  const last = n % 10;
  if (last === 1) return forms.one;
  if (last >= 2 && last <= 4) return forms.few;
  return forms.many;
};

module.exports = {
  LOCALES,
  DEFAULT_LOCALE,
  LOCALE_PREFIX,
  LOCALE_TAG,
  OG_LOCALE,
  PLURALS,
  localeFromPath,
  stripLocale,
  localizePath,
  translate,
  pluralize,
};
