const express = require('express');
const { renderHome, renderFeed, renderForm } = require('../controllers/render');
const { LOCALES, DEFAULT_LOCALE, LOCALE_PREFIX } = require('../utils/locale');

// Server-rendered HTML for crawlers. nginx maps known bot user-agents onto
// /render<path>; a browser never reaches these routes.
//
// Every route is mounted once per language, because nginx forwards the whole
// path — /en/blog arrives as /render/en/blog. The handlers read the language
// back out of req.originalUrl rather than taking it as a parameter, so the one
// source of truth for "what language is this page" is the URL itself, exactly
// as in the app.
const renderRouter = express.Router();

const PREFIXES = LOCALES.map((l) => (l === DEFAULT_LOCALE ? '' : LOCALE_PREFIX[l]));

PREFIXES.forEach((prefix) => {
  renderRouter.get(`/render${prefix}`, renderHome);
  renderRouter.get(`/render${prefix}/`, renderHome);
  renderRouter.get(`/render${prefix}/blog`, renderFeed);

  // Before /blog/:slugOrId, so «type» is matched as the literal segment it is
  // rather than read as a tasting's slug.
  renderRouter.get(`/render${prefix}/blog/type/:typeSlug`, renderFeed);
  renderRouter.get(`/render${prefix}/blog/:slugOrId`, renderForm);
});

module.exports = renderRouter;
