// Server-rendered HTML of the public pages, for crawlers and link previews.
//
// The site is a client-rendered React app: every URL returns the same 1.4 KB
// shell with an empty <div id="root">, and everything a search engine needs —
// title, description, canonical, the tasting itself — only exists after the
// JavaScript has run. Google renders JS and eventually sees it. Yandex, which
// is the majority engine for a Russian-language tea site, largely does not, and
// no chat preview does at all.
//
// nginx routes known crawler user-agents here; a browser never touches these
// routes and gets the app exactly as before. That is dynamic rendering, and it
// stays legitimate only while this HTML says what the rendered page says — so
// every claim below comes from utils/formMeta.js, which the frontend mirrors,
// and no text here is written for a robot to read.
//
// Photos, ratings, descriptors and prose are all the same values the React
// components render from the same queries.

const TeaForm = require('../models/teaform');
const Brewing = require('../models/brewing');
const Aroma = require('../models/aroma');
const Taste = require('../models/taste');
const { publicFormFilter, PUBLIC_FEED_SORTS } = require('./teaforms');
const { teaTypeSlugs, teaTypeBySlug, teaTypeShort, teaTypeName } = require('../utils/teaTypes');
const {
  LOCALES, DEFAULT_LOCALE, LOCALE_TAG, OG_LOCALE,
  localeFromPath, localizePath, translate,
} = require('../utils/locale');
const { translateDescriptorPath } = require('../utils/descriptors');
const { translateOption } = require('../utils/options');
const { previewPhotoUrl } = require('../utils/photos');
const {
  ORIGIN, filled, formDescription, formJsonLd, clamp,
} = require('../utils/formMeta');

const FEED_LIMIT = 10;

const esc = (text) => String(text === undefined || text === null ? '' : text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// JSON-LD sits inside a <script>, where the parser ends the block at the first
// literal "</script>" no matter what the JSON around it means.
const jsonLdScript = (data) => `<script type="application/ld+json">${
  JSON.stringify(data).replace(/</g, '\\u003c')
}</script>`;

// The same <head> PageMeta.jsx builds, in the markup rather than after a render.
const head = ({
  title, description, path, image, type = 'website', jsonLd, noIndex,
  locale = DEFAULT_LOCALE,
}) => {
  const site = translate('site.name', locale);
  const fullTitle = title
    ? `${title} — ${site}`
    : `${site} — ${translate('site.tagline', locale)}`;
  const text = clamp(description);
  // `path` arrives bare; the prefix is added here so the canonical and the
  // alternates below cannot disagree about where this page lives.
  const bare = path || '/';
  const url = `${ORIGIN}${localizePath(bare, locale)}`;
  const absolute = (src) => (src.startsWith('http') ? src : `${ORIGIN}${src}`);
  const preview = image ? absolute(image) : `${ORIGIN}/logo512.png`;

  return [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${esc(fullTitle)}</title>`,
    text ? `<meta name="description" content="${esc(text)}" />` : '',
    `<link rel="canonical" href="${esc(url)}" />`,
    noIndex ? '<meta name="robots" content="noindex, nofollow" />' : '',
    `<meta property="og:type" content="${esc(type)}" />`,
    `<meta property="og:site_name" content="${esc(site)}" />`,
    `<meta property="og:locale" content="${OG_LOCALE[locale]}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    text ? `<meta property="og:description" content="${esc(text)}" />` : '',
    `<meta property="og:image" content="${esc(preview)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    text ? `<meta name="twitter:description" content="${esc(text)}" />` : '',
    `<meta name="twitter:image" content="${esc(preview)}" />`,
    // hreflang: the same page in each language, pointing at each other.
    // Without these, three translations look like three competing pages and the
    // engine picks one — usually not the reader's. x-default is the Russian
    // original, which is what to serve when no language matches.
    ...(noIndex ? [] : LOCALES.map((l) => (
      `<link rel="alternate" hreflang="${LOCALE_TAG[l]}" href="${esc(`${ORIGIN}${localizePath(bare, l)}`)}" />`
    ))),
    noIndex ? '' : `<link rel="alternate" hreflang="x-default" href="${esc(`${ORIGIN}${localizePath(bare, DEFAULT_LOCALE)}`)}" />`,
    jsonLd ? jsonLdScript(jsonLd) : '',
  ].filter(Boolean).join('\n    ');
};

// The public link graph, same as SiteFooter.jsx.
//
// `bare` is the current page without its locale prefix, so the language links
// point at THIS page in the other two languages rather than at their home page.
const footer = (locale, bare) => {
  const u = (path) => localizePath(path, locale);
  return `
    <nav>
      <h2>${esc(translate('footer.sections', locale))}</h2>
      <ul>
        <li><a href="${u('/')}">${esc(translate('footer.about', locale))}</a></li>
        <li><a href="${u('/blog')}">${esc(translate('footer.feed', locale))}</a></li>
        <li><a href="${u('/sign-up')}">${esc(translate('footer.signup', locale))}</a></li>
      </ul>
      <h2>${esc(translate('footer.teaTypes', locale))}</h2>
      <ul>
        ${teaTypeSlugs.map((t) => `<li><a href="${u(`/blog/type/${t.slug}`)}">${esc(teaTypeShort(t, locale))}</a></li>`).join('\n        ')}
      </ul>
      <h2>${esc(translate('nav.language', locale))}</h2>
      <ul>
        ${LOCALES.filter((l) => l !== locale).map((l) => `<li><a hreflang="${LOCALE_TAG[l]}" href="${esc(localizePath(bare || '/', l))}">${esc(translate('site.name', l))}</a></li>`).join('\n        ')}
      </ul>
    </nav>`;
};

const page = ({ meta, body }) => `<!DOCTYPE html>
<html lang="${LOCALE_TAG[meta.locale || DEFAULT_LOCALE]}">
  <head>
    ${head(meta)}
  </head>
  <body>
${body}
${footer(meta.locale || DEFAULT_LOCALE, meta.path || '/')}
  </body>
</html>
`;

const send = (res, html, status = 200) => res.status(status)
  .type('html')
  // Crawlers re-fetch far more often than tastings change, and this is a live
  // database read on every hit. Five minutes is short enough that a new tasting
  // is not held back and long enough that a crawl does not become a load test.
  .set('Cache-Control', 'public, max-age=300')
  .send(html);

const formUrl = (form) => `/blog/${form.slug || form.sessionId}`;

const photoUrl = (form) => previewPhotoUrl(form.photos);

// The public path this request stands for, with the internal /render prefix
// removed: nginx forwards /en/blog as /render/en/blog, so the language is the
// SECOND segment here and the first everywhere else. Reading it without
// stripping made every page resolve to Russian — the alternates were still
// right, because those are built from the bare path, which is exactly why the
// bug showed up as untranslated text rather than as a broken link.
const publicPath = (req) => String(req.originalUrl || '/').replace(/^\/render/, '') || '/';
const localeOf = (req) => localeFromPath(publicPath(req));

// GET /render/blog and /render/blog/type/:typeSlug
const renderFeed = async (req, res, next) => {
  try {
    const { typeSlug } = req.params;
    const teaType = typeSlug ? teaTypeBySlug(typeSlug) : null;
    // The language is the URL's first segment — nginx forwards the whole path,
    // prefix included, so /en/blog arrives here as /render/en/blog.
    const locale = localeOf(req);
    const T = (key, vars) => translate(key, locale, vars);

    // An unknown type is a 404, not an empty feed: /blog/type/anything must not
    // become another page that answers 200 with nothing on it.
    if (typeSlug && !teaType) {
      return send(res, page({
        meta: { title: T('error.pageNotFound'), path: publicPath(req), noIndex: true, locale },
        body: `    <h1>${esc(T('error.pageNotFound'))}</h1>\n    <p><a href="${esc(localizePath('/blog', locale))}">${esc(T('error.allTastings'))}</a></p>`,
      }), 404);
    }

    const page_ = Math.max(1, parseInt(req.query.page, 10) || 1);
    const sort = PUBLIC_FEED_SORTS[req.query.sort] || PUBLIC_FEED_SORTS.date;
    const filter = { publicAccess: true, blocked: { $ne: true } };
    if (teaType) filter.type = teaType.label;

    const [total, forms] = await Promise.all([
      TeaForm.countDocuments(filter),
      TeaForm.find(filter)
        .sort(sort)
        .skip((page_ - 1) * FEED_LIMIT)
        .limit(FEED_LIMIT)
        .populate('owner', 'name nickname avatar'),
    ]);

    const pages = Math.ceil(total / FEED_LIMIT) || 1;
    const basePath = teaType ? `/blog/type/${teaType.slug}` : '/blog';
    const pageUrl = (n) => (n > 1 ? `${basePath}?page=${n}` : basePath);

    const typeName = teaType ? teaTypeShort(teaType, locale) : '';
    const heading = teaType ? T('feed.typeHeading', { type: typeName }) : T('feed.public');
    // Four titles: the feed or one tea type, first page or a later one. Written
    // out rather than nested, because a page number in the wrong one of these is
    // a duplicate <title> across pages, which is exactly what a crawler punishes.
    const titleKey = () => {
      if (teaType) return page_ > 1 ? 'feed.typeTitlePage' : 'feed.typeTitle';
      return page_ > 1 ? 'feed.titlePage' : 'feed.title';
    };
    const title = T(titleKey(), { type: typeName, page: page_ });
    const description = teaType
      ? T('feed.typeDescription', { type: typeName })
      : T('feed.description');

    const items = forms.map((form) => {
      const author = Array.isArray(form.owner) ? form.owner[0] : form.owner;
      const url = localizePath(formUrl(form), locale);
      const photo = photoUrl(form);
      return `      <li>
        <article>
          <h2><a href="${esc(url)}">${esc(form.nameRU)}</a></h2>
          ${photo ? `<img src="${esc(photo)}" alt="${esc(T('card.photoAlt', { name: form.nameRU }))}" width="130" height="130" />` : ''}
          <dl>
            ${filled(form.type) ? `<dt>${esc(T('card.teaType'))}</dt><dd>${esc(teaTypeName(form.type, locale))}</dd>` : ''}
            ${filled(form.country) ? `<dt>${esc(T('tasting.country'))}</dt><dd>${esc(translateOption(form.country, locale))}</dd>` : ''}
            ${form.averageRating != null ? `<dt>${esc(T('card.ratingLabel'))}</dt><dd>${esc(form.averageRating)}/10</dd>` : ''}
            ${author ? `<dt>${esc(T('card.author'))}</dt><dd>${esc(author.nickname || author.name)}</dd>` : ''}
          </dl>
          <p><time datetime="${esc(new Date(form.createdAt).toISOString())}">${esc(new Date(form.createdAt).toISOString().slice(0, 10))}</time></p>
        </article>
      </li>`;
    }).join('\n');

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: heading,
      numberOfItems: forms.length,
      itemListElement: forms.map((form, i) => ({
        '@type': 'ListItem',
        position: (page_ - 1) * FEED_LIMIT + i + 1,
        url: `${ORIGIN}${localizePath(formUrl(form), locale)}`,
        name: form.nameRU,
      })),
    };

    const pageHref = (n) => esc(localizePath(pageUrl(n), locale));
    const pagination = pages > 1
      ? `    <nav aria-label="${esc(T('feed.pages'))}">
      ${page_ > 1 ? `<a rel="prev" href="${pageHref(page_ - 1)}">${esc(T('feed.prev'))}</a>` : ''}
      <span>${esc(T('feed.pageOf', { page: page_, pages }))}</span>
      ${page_ < pages ? `<a rel="next" href="${pageHref(page_ + 1)}">${esc(T('feed.next'))}</a>` : ''}
    </nav>`
      : '';

    return send(res, page({
      meta: {
        title,
        description,
        // Canonical keeps ?page but drops ?sort — the same tastings reordered
        // are the same page, and each sort would otherwise be a near-duplicate.
        path: pageUrl(page_),
        locale,
        jsonLd,
      },
      body: `    <h1>${esc(heading)}</h1>
    <p>${esc(description)}</p>
    <ul>
${items || `      <li>${esc(T('card.nothingPublished'))}</li>`}
    </ul>
${pagination}`,
    }));
  } catch (err) {
    const e = new Error(err.message);
    e.statusCode = 500;
    return next(e);
  }
};

// GET /render/blog/:slugOrId
const renderForm = async (req, res, next) => {
  try {
    const { slugOrId } = req.params;
    const locale = localeOf(req);
    const T = (key, vars) => translate(key, locale, vars);
    const form = await TeaForm.findOne(publicFormFilter(slugOrId))
      .populate('owner', 'name nickname avatar');

    // A tasting that was deleted, unpublished or hidden by a moderator must say
    // so with a status code. The SPA answers 200 with an empty shell for every
    // one of these, which is how a site accumulates thousands of soft 404s.
    if (!form) {
      return send(res, page({
        meta: { title: T('error.recordNotFound'), path: publicPath(req), noIndex: true, locale },
        body: `    <h1>${esc(T('error.recordNotFound'))}</h1>\n    <p><a href="${esc(localizePath('/blog', locale))}">${esc(T('error.allTastings'))}</a></p>`,
      }), 404);
    }

    // Reached by an address that is not the canonical one — an old /blog/<uuid>
    // link, or the slug before a rename. Redirect rather than serve the page
    // twice under two URLs — and stay in the language it was reached in.
    const canonical = formUrl(form);
    if (`/blog/${slugOrId}` !== canonical) {
      return res.redirect(301, localizePath(canonical, locale));
    }

    const [brewings, aromas, tastes] = await Promise.all([
      Brewing.find({ sessionId: form.sessionId }).sort({ brewingCount: 1 }),
      Aroma.find({ sessionId: form.sessionId }),
      Taste.find({ sessionId: form.sessionId }),
    ]);

    const author = Array.isArray(form.owner) ? form.owner[0] : form.owner;
    const preview = photoUrl(form);

    const descriptorPath = (rec, prefix) => [1, 2, 3]
      .map((n) => rec[`${prefix}${n}`])
      .filter((v) => filled(v))
      .join(' → ');

    const metaRow = (label, value) => (filled(value)
      ? `      <dt>${esc(label)}</dt><dd>${esc(value)}</dd>` : '');

    // The dry leaf is smelled before the first pour, so its descriptors are
    // Aroma documents on brewing 0 — a number no Brewing ever has, which is why
    // the per-пролив loop below never picks them up.
    const dryAromaPaths = aromas
      .filter((a) => Number(a.brewingCount) === 0)
      .sort((a, b) => a.aromaCount - b.aromaCount)
      .map((a) => descriptorPath(a, 'aromaStage'))
      .filter(Boolean);

    const brewSections = brewings.map((brew) => {
      const aromaPaths = aromas
        .filter((a) => a.brewingCount === brew.brewingCount)
        .sort((a, b) => a.aromaCount - b.aromaCount)
        .map((a) => descriptorPath(a, 'aromaStage'))
        .filter(Boolean);
      const tastePaths = tastes
        .filter((t) => t.brewingCount === brew.brewingCount)
        .sort((a, b) => a.tasteCount - b.tasteCount)
        .map((t) => descriptorPath(t, 'tasteStage'))
        .filter(Boolean);

      // The descriptors are stored in Russian; only their display is
      // translated. The taster's own free-text description is never touched.
      const tr = (p) => esc(translateDescriptorPath(p, locale));
      return `      <section>
        <h3>${esc(T('tasting.steep', { n: brew.brewingCount }))}${brew.brewingRating != null ? ` — ${esc(brew.brewingRating)}/10` : ''}</h3>
        ${filled(brew.brewingTime) && brew.brewingTime !== '00:00:00' ? `<p>${esc(T('tasting.steepTime'))}: ${esc(brew.brewingTime)}</p>` : ''}
        ${filled(brew.description) ? `<p>${esc(brew.description)}</p>` : ''}
        ${aromaPaths.length ? `<p>${esc(T('tasting.aroma'))}: ${aromaPaths.map(tr).join('; ')}</p>` : ''}
        ${tastePaths.length ? `<p>${esc(T('tasting.taste'))}: ${tastePaths.map(tr).join('; ')}</p>` : ''}
      </section>`;
    }).join('\n');

    const typeHub = teaTypeSlugs.find((t) => t.label === form.type);

    return send(res, page({
      meta: {
        title: form.nameRU,
        description: formDescription(form, brewings, locale),
        image: preview,
        path: canonical,
        type: 'article',
        locale,
        jsonLd: formJsonLd(form, preview, locale),
      },
      body: `    <article>
      <h1>${esc(form.nameRU)}</h1>
      ${preview ? `<img src="${esc(preview)}" alt="${esc(T('card.photoAlt', { name: form.nameRU }))}" />` : ''}
      <p>${author ? `${esc(author.nickname || author.name)} · ` : ''}<time datetime="${esc(new Date(form.createdAt).toISOString())}">${esc(new Date(form.createdAt).toISOString().slice(0, 10))}</time>${form.averageRating != null ? ` · ${esc(T('tasting.bowls', { n: form.averageRating }))}` : ''}</p>
      <dl>
${[
    metaRow(T('card.teaType'), teaTypeName(form.type, locale)),
    metaRow(T('tasting.country'), translateOption(form.country, locale)),
    metaRow(T('tasting.shop'), form.shop),
    metaRow(T('tasting.weight'), form.weight != null ? `${form.weight} ${T('unit.gram')}` : ''),
    metaRow(T('tasting.water'), form.water),
    metaRow(T('tasting.volume'), form.volume != null ? `${form.volume} ${T('unit.ml')}` : ''),
    metaRow(T('tasting.temperature'), form.temperature != null ? `${form.temperature} °C` : ''),
    metaRow(T('tasting.price'), form.price != null ? `${form.price} ₽` : ''),
    metaRow(T('tasting.teaware'), translateOption(form.teaware, locale)),
    metaRow(T('tasting.brewingMethod'), translateOption(form.brewingtype, locale)),
  ].filter(Boolean).join('\n')}
      </dl>
${filled(form.description) ? `      <section>
        <h2>${esc(T('tasting.generalDescription'))}</h2>
        <p>${esc(form.description)}</p>
      </section>` : ''}
${dryAromaPaths.length || filled(form.dryAromaDescription) ? `      <section>
        <h2>${esc(T('tasting.dryAroma'))}</h2>
        ${dryAromaPaths.length ? `<p>${dryAromaPaths.map((p) => esc(translateDescriptorPath(p, locale))).join('; ')}</p>` : ''}
        ${filled(form.dryAromaDescription) ? `<p>${esc(form.dryAromaDescription)}</p>` : ''}
      </section>` : ''}
${brewSections}
      ${typeHub ? `<p><a href="${esc(localizePath(`/blog/type/${typeHub.slug}`, locale))}">${esc(T('tasting.allOfType', { type: teaTypeShort(typeHub, locale) }))}</a></p>` : ''}
      <p><a href="${esc(localizePath('/blog', locale))}">${esc(T('tasting.backToFeed'))}</a></p>
    </article>`,
    }));
  } catch (err) {
    const e = new Error(err.message);
    e.statusCode = 500;
    return next(e);
  }
};

// GET /render/ — the landing page.
const renderHome = (req, res) => {
  const locale = localeOf(req);
  const T = (key, vars) => translate(key, locale, vars);
  const u = (path) => esc(localizePath(path, locale));

  return send(res, page({
    meta: {
      title: '',
      description: T('landing.description'),
      path: '/',
      locale,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: T('site.name'),
        url: `${ORIGIN}/`,
        inLanguage: LOCALE_TAG[locale],
        description: T('site.tagline'),
        publisher: {
          '@type': 'Organization',
          name: T('site.name'),
          url: `${ORIGIN}/`,
          logo: `${ORIGIN}/logo512.png`,
        },
      },
    },
    body: `    <h1>${esc(T('landing.title'))}</h1>
    <p>${esc(T('landing.lead'))}</p>
    <p><a href="${u('/blog')}">${esc(T('landing.readTastings'))}</a> · <a href="${u('/sign-up')}">${esc(T('landing.startDiary'))}</a></p>
    <h2>${esc(T('landing.howItWorks'))}</h2>
    <ol>
      <li>${esc(T('landing.step1'))}</li>
      <li>${esc(T('landing.step2'))}</li>
      <li>${esc(T('landing.step3'))}</li>
      <li>${esc(T('landing.step4'))}</li>
    </ol>`,
  }));
};

module.exports = { renderHome, renderFeed, renderForm };
