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
const { teaTypeSlugs, teaTypeBySlug } = require('../utils/teaTypes');
const { previewPhotoUrl } = require('../utils/photos');
const {
  ORIGIN, filled, formDescription, formJsonLd, clamp,
} = require('../utils/formMeta');

const FEED_LIMIT = 10;
const SITE = 'Форма чая';

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
}) => {
  const fullTitle = title ? `${title} — ${SITE}` : `${SITE} — дневник чайных дегустаций`;
  const text = clamp(description);
  const url = `${ORIGIN}${path || '/'}`;
  const preview = image
    ? (image.startsWith('http') ? image : `${ORIGIN}${image}`)
    : `${ORIGIN}/logo512.png`;

  return [
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${esc(fullTitle)}</title>`,
    text ? `<meta name="description" content="${esc(text)}" />` : '',
    `<link rel="canonical" href="${esc(url)}" />`,
    noIndex ? '<meta name="robots" content="noindex, nofollow" />' : '',
    `<meta property="og:type" content="${esc(type)}" />`,
    `<meta property="og:site_name" content="${esc(SITE)}" />`,
    '<meta property="og:locale" content="ru_RU" />',
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    text ? `<meta property="og:description" content="${esc(text)}" />` : '',
    `<meta property="og:image" content="${esc(preview)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    text ? `<meta name="twitter:description" content="${esc(text)}" />` : '',
    `<meta name="twitter:image" content="${esc(preview)}" />`,
    jsonLd ? jsonLdScript(jsonLd) : '',
  ].filter(Boolean).join('\n    ');
};

// The public link graph, same as SiteFooter.jsx.
const footer = () => `
    <nav>
      <h2>Разделы</h2>
      <ul>
        <li><a href="/">О сайте</a></li>
        <li><a href="/blog">Лента дегустаций</a></li>
      </ul>
      <h2>Типы чая</h2>
      <ul>
        ${teaTypeSlugs.map((t) => `<li><a href="/blog/type/${t.slug}">${esc(t.short)}</a></li>`).join('\n        ')}
      </ul>
    </nav>`;

const page = ({ meta, body }) => `<!DOCTYPE html>
<html lang="ru">
  <head>
    ${head(meta)}
  </head>
  <body>
${body}
${footer()}
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

// GET /render/blog and /render/blog/type/:typeSlug
const renderFeed = async (req, res, next) => {
  try {
    const { typeSlug } = req.params;
    const teaType = typeSlug ? teaTypeBySlug(typeSlug) : null;

    // An unknown type is a 404, not an empty feed: /blog/type/anything must not
    // become another page that answers 200 with nothing on it.
    if (typeSlug && !teaType) {
      return send(res, page({
        meta: { title: 'Страница не найдена', path: req.originalUrl, noIndex: true },
        body: '    <h1>Страница не найдена</h1>\n    <p><a href="/blog">Все дегустации</a></p>',
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

    const heading = teaType ? `${teaType.short} — дегустации` : 'Публичные формы';
    const title = teaType
      ? `${teaType.short}: дегустации и отзывы${page_ > 1 ? ` — страница ${page_}` : ''}`
      : `Лента дегустаций${page_ > 1 ? ` — страница ${page_}` : ''}`;
    const description = teaType
      ? `Дегустации, собранные читателями: ${teaType.short.toLowerCase()} — аромат, вкус, проливы, оценки и фотографии.`
      : 'Дегустации чая, которыми поделились участники: аромат, вкус, проливы, фотографии и голосовые заметки.';

    const items = forms.map((form, i) => {
      const author = Array.isArray(form.owner) ? form.owner[0] : form.owner;
      const url = formUrl(form);
      const photo = photoUrl(form);
      return `      <li>
        <article>
          <h2><a href="${esc(url)}">${esc(form.nameRU)}</a></h2>
          ${photo ? `<img src="${esc(photo)}" alt="Фото чая: ${esc(form.nameRU)}" width="130" height="130" />` : ''}
          <dl>
            ${filled(form.type) ? `<dt>Тип чая</dt><dd>${esc(form.type)}</dd>` : ''}
            ${filled(form.country) ? `<dt>Страна</dt><dd>${esc(form.country)}</dd>` : ''}
            ${form.averageRating != null ? `<dt>Оценка</dt><dd>${esc(form.averageRating)}/10</dd>` : ''}
            ${author ? `<dt>Автор</dt><dd>${esc(author.nickname || author.name)}</dd>` : ''}
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
        url: `${ORIGIN}${formUrl(form)}`,
        name: form.nameRU,
      })),
    };

    const pagination = pages > 1
      ? `    <nav aria-label="Страницы">
      ${page_ > 1 ? `<a rel="prev" href="${esc(pageUrl(page_ - 1))}">Назад</a>` : ''}
      <span>Страница ${page_} из ${pages}</span>
      ${page_ < pages ? `<a rel="next" href="${esc(pageUrl(page_ + 1))}">Вперёд</a>` : ''}
    </nav>`
      : '';

    return send(res, page({
      meta: {
        title,
        description,
        // Canonical keeps ?page but drops ?sort — the same tastings reordered
        // are the same page, and each sort would otherwise be a near-duplicate.
        path: pageUrl(page_),
        jsonLd,
      },
      body: `    <h1>${esc(heading)}</h1>
    <p>${esc(description)}</p>
    <ul>
${items || '      <li>Пока ничего не опубликовано.</li>'}
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
    const form = await TeaForm.findOne(publicFormFilter(slugOrId))
      .populate('owner', 'name nickname avatar');

    // A tasting that was deleted, unpublished or hidden by a moderator must say
    // so with a status code. The SPA answers 200 with an empty shell for every
    // one of these, which is how a site accumulates thousands of soft 404s.
    if (!form) {
      return send(res, page({
        meta: { title: 'Запись не найдена', path: req.originalUrl, noIndex: true },
        body: '    <h1>Запись не найдена</h1>\n    <p><a href="/blog">Все дегустации</a></p>',
      }), 404);
    }

    // Reached by an address that is not the canonical one — an old /blog/<uuid>
    // link, or the slug before a rename. Redirect rather than serve the page
    // twice under two URLs.
    const canonical = formUrl(form);
    if (`/blog/${slugOrId}` !== canonical) {
      return res.redirect(301, canonical);
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

      return `      <section>
        <h3>Пролив №${esc(brew.brewingCount)}${brew.brewingRating != null ? ` — ${esc(brew.brewingRating)}/10` : ''}</h3>
        ${filled(brew.brewingTime) && brew.brewingTime !== '00:00:00' ? `<p>Время заваривания: ${esc(brew.brewingTime)}</p>` : ''}
        ${filled(brew.description) ? `<p>${esc(brew.description)}</p>` : ''}
        ${aromaPaths.length ? `<p>Аромат: ${aromaPaths.map(esc).join('; ')}</p>` : ''}
        ${tastePaths.length ? `<p>Вкус: ${tastePaths.map(esc).join('; ')}</p>` : ''}
      </section>`;
    }).join('\n');

    const typeHub = teaTypeSlugs.find((t) => t.label === form.type);

    return send(res, page({
      meta: {
        title: form.nameRU,
        description: formDescription(form, brewings),
        image: preview,
        path: canonical,
        type: 'article',
        jsonLd: formJsonLd(form, brewings, preview),
      },
      body: `    <article>
      <h1>${esc(form.nameRU)}</h1>
      ${preview ? `<img src="${esc(preview)}" alt="Фото чая: ${esc(form.nameRU)}" />` : ''}
      <p>${author ? `${esc(author.nickname || author.name)} · ` : ''}<time datetime="${esc(new Date(form.createdAt).toISOString())}">${esc(new Date(form.createdAt).toISOString().slice(0, 10))}</time>${form.averageRating != null ? ` · ${esc(form.averageRating)}/10 пиал` : ''}</p>
      <dl>
${[
    metaRow('Тип чая', form.type),
    metaRow('Страна', form.country),
    metaRow('Магазин', form.shop),
    metaRow('Вес', form.weight != null ? `${form.weight} г` : ''),
    metaRow('Вода', form.water),
    metaRow('Объем воды', form.volume != null ? `${form.volume} мл` : ''),
    metaRow('Температура воды', form.temperature != null ? `${form.temperature} °C` : ''),
    metaRow('Цена за грамм', form.price != null ? `${form.price} ₽` : ''),
    metaRow('Посуда', form.teaware),
    metaRow('Метод заваривания', form.brewingtype),
  ].filter(Boolean).join('\n')}
      </dl>
${brewSections}
      ${typeHub ? `<p><a href="/blog/type/${typeHub.slug}">Все дегустации: ${esc(typeHub.short)}</a></p>` : ''}
      <p><a href="/blog">← Все публичные формы</a></p>
    </article>`,
    }));
  } catch (err) {
    const e = new Error(err.message);
    e.statusCode = 500;
    return next(e);
  }
};

// GET /render/ — the landing page.
const renderHome = (req, res) => send(res, page({
  meta: {
    title: '',
    description: 'Дневник чайных дегустаций: аромат, вкус и проливы, фото и голосовые заметки. Ведите свои записи и читайте дегустации других.',
    path: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE,
      url: `${ORIGIN}/`,
      inLanguage: 'ru-RU',
      description: 'Дневник чайных дегустаций',
      publisher: {
        '@type': 'Organization',
        name: SITE,
        url: `${ORIGIN}/`,
        logo: `${ORIGIN}/logo512.png`,
      },
    },
  },
  body: `    <h1>Форма чая — дневник чайных дегустаций</h1>
    <p>Записывайте, как заварился чай: аромат и вкус по проливам, температура, посуда и время,
       фотографии сухого листа, настоя и мокрого листа. Надиктуйте заметку голосом — расшифровка
       и разбор по полям сделаются сами.</p>
    <p><a href="/blog">Читать дегустации</a> · <a href="/sign-up">Завести свой дневник</a></p>`,
}));

module.exports = { renderHome, renderFeed, renderForm };
