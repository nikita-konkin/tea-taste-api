const { LOCALES, DEFAULT_LOCALE } = require('../utils/locale');

// Decides which language this request's error messages come back in.
//
// `X-Locale` first, because the app knows something the browser does not: which
// language the page is actually being read at. A reader on a Russian-configured
// browser looking at /en/blog wants the English message, and Accept-Language
// would give them Russian.
//
// Accept-Language is the fallback for anything that is not the app — a shared
// link opened by a tool, curl, another client. Russian is the default, so a
// request that says nothing behaves exactly as it did before this existed.
//
// The header is untrusted input: only an exact match against the known locales
// counts, never the raw string.
const localeFromHeaders = (req) => {
  const explicit = String(req.get('X-Locale') || '').trim().toLowerCase();
  if (LOCALES.includes(explicit)) return explicit;

  // Accept-Language: `zh-Hans,zh;q=0.9,en;q=0.8` — take the tags in order and
  // keep the first whose primary subtag is one we serve. Quality values are not
  // re-sorted: browsers already send them in preference order.
  const accept = String(req.get('Accept-Language') || '');
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    const primary = tag.split('-')[0];
    if (LOCALES.includes(primary)) return primary;
  }
  return DEFAULT_LOCALE;
};

module.exports = (req, res, next) => {
  req.locale = localeFromHeaders(req);
  // Tells caches that the body varies by language — without it a shared cache
  // could serve an English error to the next Russian reader.
  res.vary('X-Locale');
  res.vary('Accept-Language');
  next();
};
