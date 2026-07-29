const express = require('express');
const { renderHome, renderFeed, renderForm } = require('../controllers/render');

// Server-rendered HTML for crawlers. nginx maps known bot user-agents onto
// /render<path>; a browser never reaches these routes.
const renderRouter = express.Router();

renderRouter.get('/render', renderHome);
renderRouter.get('/render/', renderHome);
renderRouter.get('/render/blog', renderFeed);

// Before /render/blog/:slugOrId, so «type» is matched as the literal segment it
// is rather than read as a tasting's slug.
renderRouter.get('/render/blog/type/:typeSlug', renderFeed);
renderRouter.get('/render/blog/:slugOrId', renderForm);

module.exports = renderRouter;
