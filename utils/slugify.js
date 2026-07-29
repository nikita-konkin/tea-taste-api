// Readable URLs for tastings: /blog/da-hun-pao-1b6baccc4c instead of
// /blog/9e1c4f2a-7b3d-4a11-9c2e-5f8a1d0b3e77.
//
// A UUID tells a reader nothing about what is behind the link and gives a
// search engine nothing to match a query against. The tea's own name does both.

const crypto = require('crypto');

// GOST 7.79 System B, near enough — the same mapping people expect when they
// see a Russian name written in Latin letters.
const RU_LAT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya',
};

// Long enough that no two tastings collide in practice, short enough to stay
// readable. Appended always, not only on conflict: a slug that sometimes
// carries a suffix and sometimes does not is a slug whose shape no other code
// can rely on.
const SUFFIX_LENGTH = 10;
const MAX_NAME_LENGTH = 60;

// A *hash* of the whole sessionId, not a slice of it.
//
// Slicing looked equivalent and is not: it keeps only the entropy that happens
// to sit at that end of the string. Two sessionIds differing solely in their
// last character share every prefix, so they produced the same suffix, and a
// tasting of the same tea under both names hit the unique index and failed to
// save with a 500. Hashing uses all 122 bits wherever they are.
//
// 10 hex characters is 40 bits: at ten thousand tastings the chance of any
// collision at all is about 1 in 20,000, and the callers degrade gracefully if
// one ever happens.
const suffixFor = (sessionId) => crypto
  .createHash('sha1')
  .update(String(sessionId))
  .digest('hex')
  .slice(0, SUFFIX_LENGTH);

const transliterate = (text) => String(text || '')
  .toLowerCase()
  .split('')
  .map((char) => (Object.prototype.hasOwnProperty.call(RU_LAT, char) ? RU_LAT[char] : char))
  .join('');

// The readable half of a slug. Returns '' when the name survives none of this —
// Chinese-only tea names are common here, and they transliterate to nothing.
const slugifyName = (name) => transliterate(name)
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, MAX_NAME_LENGTH)
  .replace(/-+$/g, '');

// The permanent address of one tasting. sessionId is the only part guaranteed
// to exist and to be unique, so it is what the suffix is derived from — the
// same tasting always produces the same slug, and renaming a tea moves its
// readable half without ever colliding with another.
//
// Returns '' without a sessionId rather than a bare name: a slug missing its
// suffix is one two tastings of the same tea would both claim, and the unique
// index would then reject the second save. There is no caller that wants one.
const buildSlug = (nameRU, sessionId) => {
  if (!sessionId) return '';
  const suffix = suffixFor(sessionId);
  const name = slugifyName(nameRU);
  return name ? `${name}-${suffix}` : suffix;
};

// Tells an old /blog/<uuid> link from a current one without a database round
// trip, so the resolver knows which field to look the address up by.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const looksLikeUuid = (value) => UUID_RE.test(String(value || ''));

// Mongo's duplicate-key code. A slug is an alias, never the only way to reach a
// tasting — sessionId always resolves — so a caller that hits this should drop
// the slug and save anyway rather than fail the write.
const DUPLICATE_KEY = 11000;
const isDuplicateSlug = (err) => Boolean(err)
  && (err.code === DUPLICATE_KEY || (err.cause && err.cause.code === DUPLICATE_KEY))
  && /slug/.test(JSON.stringify(err.keyPattern || err.keyValue || ''));

module.exports = {
  transliterate,
  slugifyName,
  buildSlug,
  looksLikeUuid,
  isDuplicateSlug,
  SUFFIX_LENGTH,
};
