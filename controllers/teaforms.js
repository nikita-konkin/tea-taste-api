const path = require('path');
const fs = require('fs');

const TeaForm = require('../models/teaform');
const Brewing = require('../models/brewing');
const Aroma = require('../models/aroma');
const Taste = require('../models/taste');
const { delBySessionID } = require('../utils/delAllDocsFromCollection');
const { getTeaDataBySessionIdAndOwner } = require('../utils/getTeaDataBy');
const { uploadDir } = require('../middlewares/upload');
const { ownsUpload } = require('./uploads');
const { enqueue } = require('../utils/voiceJob');
const { extractFromTranscript } = require('../utils/extractForm');
const { buildSlug, looksLikeUuid, isDuplicateSlug } = require('../utils/slugify');
const { orderedPhotoUrls } = require('../utils/photos');
const { teaTypeSlugs } = require('../utils/teaTypes');
const { LOCALES, DEFAULT_LOCALE, LOCALE_TAG, localizePath } = require('../utils/locale');
const { t } = require('../utils/apiMessages');

// Only `segments` is the client's to send. Everything else under `voice` —
// the merged track, the transcript, the recognition status and operation id —
// is written by the background job, and an edit dialog that was opened before
// recognition finished would otherwise save its stale copy back over it.
const clientSegments = (voice) => {
  if (!voice || !Array.isArray(voice.segments)) return undefined;
  return voice.segments.map(({
    url, brewingNumber, duration, whole,
  }) => ({
    url,
    brewingNumber: Number(brewingNumber) || 0,
    duration: Number(duration) || 0,
    whole: Boolean(whole),
  }));
};

module.exports.createTeaForm = (req, res, next) => {
  const {
    nameRU,
    country,
    shop,
    type,
    weight,
    water,
    volume,
    temperature,
    price,
    teaware,
    brewingtype,
    publicAccess,
    averageRating,
    description,
    dryAromaDescription,
    photos,
    voice,
  } = req.body;
  // const { aromas, tastes, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const { sessionId } = req.params;
  // const brewingCount = req.params.brewId;

  // A tasting saved from a recording alone has no name yet — the transcript has
  // it, but that arrives a minute later. Without this the card renders a blank
  // title. Derived server-side so it is a real stored value the extraction can
  // overwrite, not a display-time placeholder that every view has to know about.
  //
  // Month names are spelled out rather than left to toLocaleDateString: the
  // alpine image ships a small-ICU node, which would quietly answer in English.
  const MONTHS_RU = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const today = new Date();
  const title = (nameRU || '').trim()
    || `Дегустация ${today.getDate()} ${MONTHS_RU[today.getMonth()]}`;

  const segments = clientSegments(voice);
  // "queued" is what the transcription job looks for; with no recordings the
  // key is omitted entirely and the model's own default applies.
  const voiceDoc = segments && segments.length
    ? { segments, status: 'queued', public: false }
    : undefined;

  // A tasting that carries a recording is never published on creation: the
  // wizard cannot know what else ended up on the tape. Publishing it stays a
  // deliberate act in /my_forms, after the owner has heard it back.
  const publishable = voiceDoc ? false : publicAccess;

  const insert = (slug) => TeaForm.updateMany(
    {
      sessionId,
      owner,
    },
    {
      $setOnInsert: {
        nameRU: title,
        country,
        shop,
        type,
        weight,
        water,
        volume,
        temperature,
        price,
        teaware,
        brewingtype,
        publicAccess: publishable,
        description,
        dryAromaDescription,
        sessionId,
        // Omitted rather than written empty when there is none: the unique index
        // ignores a missing slug but treats '' as a value two documents would be
        // colliding on.
        ...(slug ? { slug } : {}),
        owner,
        averageRating,
        photos,
        voice: voiceDoc,
      },
    },
    { upsert: true },
  );

  // The readable URL is an alias, not the tasting's identity — sessionId always
  // resolves it. So on the vanishingly rare slug collision the tasting is saved
  // without one and keeps its sessionId address, rather than failing to save at
  // all over a cosmetic field.
  insert(buildSlug(title, sessionId))
    .catch((err) => {
      if (!isDuplicateSlug(err)) throw err;
      console.warn(`Slug collision for ${sessionId}; saved without one.`);
      return insert('');
    })
    .then((form) => {
      // After the response: merging and recognition take far longer than a
      // request may, and the tasting is saved either way.
      if (voiceDoc) enqueue(owner, sessionId);
      return res.send({
        data: form,
      });
    })
    .catch((err) => {
      if (err.name === 'ValidationError') {
        const e = new Error(t(req, 'api.badData'));
        e.statusCode = 400;
        next(e);
      } else {
        const e = new Error(t(req, 'api.default'));
        e.statusCode = 500;
        next(e);
      }
    });
};

module.exports.getTeaFormsByID = (req, res, next) => {
  getTeaDataBySessionIdAndOwner(req, res, next, TeaForm);
};

module.exports.getTeaForms = (req, res, next) => {
  const owner = req.user._id;
  TeaForm.find({ owner })
    .then((forms) =>
      res.send({
        data: forms,
      }),
    )
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};

// Exported so the crawler renderer orders the feed exactly as the app does —
// the same URL must not list the tastings in two different orders depending on
// who asked for it.
const PUBLIC_FEED_SORTS = {
  date: { createdAt: -1 },
  '-date': { createdAt: 1 },
  rating: { averageRating: -1, createdAt: -1 },
  '-rating': { averageRating: 1, createdAt: -1 },
};

module.exports.PUBLIC_FEED_SORTS = PUBLIC_FEED_SORTS;

// Public feed with pagination, tea-type filter and sorting:
//   ?page=1&limit=10&type=<exact tea type>&sort=date|-date|rating|-rating
module.exports.getPublicTeaForms = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    // $ne: true rather than false — documents written before the field existed
    // have no `blocked` at all, and `blocked: false` would exclude every one.
    const filter = { publicAccess: true, blocked: { $ne: true } };
    if (req.query.type) filter.type = req.query.type;

    const sort = PUBLIC_FEED_SORTS[req.query.sort] || PUBLIC_FEED_SORTS.date;

    const [total, forms] = await Promise.all([
      TeaForm.countDocuments(filter),
      TeaForm.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('owner', 'name nickname avatar'),
    ]);

    res.send({
      // Same rule as the single public form: the feed must not carry audio the
      // owner has not shared.
      data: forms.map((form) => {
        const shared = form.toObject();
        if (!shared.voice || !shared.voice.public) delete shared.voice;
        return shared;
      }),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    const e = new Error(err.message);
    e.statusCode = 500;
    next(e);
  }
};

// GET /sitemap.xml — every publicly readable URL, for search engines.
//
// Served by the API rather than shipped as a static file because the list is
// the database: a tasting published (or blocked) an hour ago has to be in (or
// out of) it. robots.txt points here.
const SITE = process.env.FRONTEND_URL || 'https://teaform.ru';

const xmlEscape = (text) => String(text || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

module.exports.getSitemap = async (req, res, next) => {
  try {
    const forms = await TeaForm.find({ publicAccess: true, blocked: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(5000)
      .select('sessionId slug nameRU photos updatedAt createdAt');

    const newest = forms[0];
    const feedLastmod = newest
      ? (newest.updatedAt || newest.createdAt).toISOString().slice(0, 10)
      : undefined;

    // One entry per page, written as a BARE path; each is emitted once per
    // language below.
    const pages = [
      // The root was missing entirely — it is the page that explains what the
      // site is, and the one most likely to rank for the site's own name.
      { path: '/', priority: '1.0', changefreq: 'weekly', lastmod: feedLastmod },
      { path: '/blog', priority: '0.9', changefreq: 'daily', lastmod: feedLastmod },
      // One hub per tea type. Listed unconditionally: a type with nothing in it
      // yet is a page that will fill up, and dropping it from the sitemap only
      // delays the day it is crawled.
      ...teaTypeSlugs.map((type) => ({
        path: `/blog/type/${type.slug}`,
        priority: '0.8',
        changefreq: 'weekly',
        lastmod: feedLastmod,
      })),
      ...forms.map((form) => ({
        path: `/blog/${form.slug || form.sessionId}`,
        lastmod: (form.updatedAt || form.createdAt || new Date()).toISOString().slice(0, 10),
        priority: '0.7',
        changefreq: 'monthly',
        // Tea photography is a real way into a site like this through image
        // search, and nothing else on the site declares these pictures exist.
        // Declared on the Russian entry only — it is the same photograph in all
        // three languages, and listing it three times would ask the crawler to
        // fetch it three times to learn that.
        images: orderedPhotoUrls(form.photos).map((url) => ({
          loc: `${SITE}${url}`,
          title: form.nameRU,
        })),
      })),
    ];

    // Every page in every language, each entry naming its own translations.
    //
    // The xhtml:link alternates matter as much as the extra URLs: without them
    // the three copies of a page compete with each other, and the engine picks
    // one — usually not the one matching the reader's language.
    const urls = pages.flatMap((entry) => LOCALES.map((locale) => ({
      ...entry,
      loc: `${SITE}${localizePath(entry.path, locale)}`,
      images: locale === DEFAULT_LOCALE ? entry.images : [],
      alternates: [
        ...LOCALES.map((l) => ({ hreflang: LOCALE_TAG[l], href: `${SITE}${localizePath(entry.path, l)}` })),
        { hreflang: 'x-default', href: `${SITE}${localizePath(entry.path, DEFAULT_LOCALE)}` },
      ],
    })));

    const body = urls.map(({
      loc, lastmod, priority, changefreq, images, alternates,
    }) => [
      '  <url>',
      `    <loc>${xmlEscape(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : '',
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority}</priority>`,
      ...(alternates || []).map((alt) => (
        `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alt.hreflang)}" href="${xmlEscape(alt.href)}" />`
      )),
      ...(images || []).map((img) => [
        '    <image:image>',
        `      <image:loc>${xmlEscape(img.loc)}</image:loc>`,
        `      <image:title>${xmlEscape(img.title)}</image:title>`,
        '    </image:image>',
      ].join('\n')),
      '  </url>',
    ].filter(Boolean).join('\n')).join('\n');

    // The xhtml namespace is what makes the hreflang alternates above legal —
    // without the declaration the whole sitemap fails validation.
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`,
    );
  } catch (err) {
    const e = new Error(t(req, 'api.default'));
    e.statusCode = 500;
    next(e);
  }
};

// The filter that finds one published tasting by either address it can have.
//
// Every /blog/<uuid> link ever shared or indexed has to keep resolving, so the
// sessionId is matched as well as the slug — forever, not as a migration
// window. Which one matched is decided by shape, not by trying both: a UUID is
// never a valid slug and a slug is never a valid UUID.
const publicFormFilter = (slugOrId) => ({
  ...(looksLikeUuid(slugOrId) ? { sessionId: slugOrId } : { slug: slugOrId }),
  publicAccess: true,
  blocked: { $ne: true },
});

module.exports.publicFormFilter = publicFormFilter;

// One public form by slug or sessionId (shareable /blog/:slugOrId pages).
module.exports.getPublicTeaFormById = (req, res, next) => {
  TeaForm.findOne(publicFormFilter(req.params.sessionId))
    .populate('owner', 'name nickname avatar')
    .orFail(() => {
      const e = new Error(t(req, 'api.notFound'));
      e.statusCode = 404;
      return e;
    })
    .then((form) => {
      // The tasting being public does not make its audio public. Withheld at the
      // response, not just hidden in the UI: the raw endpoint is what a scraper
      // reads, and an unshared recording must not be in it at all.
      const shared = form.toObject();
      if (!shared.voice || !shared.voice.public) delete shared.voice;
      return res.send({ data: shared });
    })
    .catch((err) => {
      if (err.statusCode) {
        next(err);
      } else {
        const e = new Error(err.message);
        e.statusCode = 500;
        next(e);
      }
    });
};

module.exports.patchTeaForm = (req, res, next) => {
  const {
    nameRU,
    country,
    shop,
    type,
    weight,
    water,
    volume,
    temperature,
    price,
    teaware,
    brewingtype,
    publicAccess,
    averageRating,
    description,
    dryAromaDescription,
    photos,
    voice,
  } = req.body;
  // const { aromas, tastes, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const { sessionId } = req.params;

  const update = {
    nameRU,
    country,
    shop,
    type,
    weight,
    water,
    volume,
    temperature,
    price,
    teaware,
    brewingtype,
    publicAccess,
    averageRating,
    description,
    dryAromaDescription,
    // Mongoose drops undefined keys from the cast update, so omitting photos
    // preserves them, while an explicit [] clears them.
    photos,
    // $set: {
    // sessionId: sessionId,
    // owner: owner,
  };

  // Renaming the tea moves its public address with it, so the URL keeps
  // describing what is on the page. The sessionId half of the slug does not
  // change, so an old link still identifies the same tasting and the render
  // endpoint redirects it to the new address rather than 404ing.
  if (nameRU && buildSlug(nameRU, sessionId)) {
    update.slug = buildSlug(nameRU, sessionId);
  }

  // Sharing the recording is the owner's call and is edited on its own, without
  // touching the segments — so it is handled apart from the block below.
  if (voice && typeof voice.public === 'boolean') {
    update['voice.public'] = voice.public;
  }

  const segments = clientSegments(voice);
  if (segments) {
    // Sub-paths, deliberately: assigning `voice` as a whole object would
    // replace the entire subdocument and take the transcript and merged track
    // with it, even though the client never sent either.
    update['voice.segments'] = segments;
    update['voice.status'] = segments.length ? 'queued' : 'idle';
    update['voice.error'] = '';
    if (!segments.length) {
      update['voice.transcript'] = '';
      update['voice.transcriptRaw'] = '';
      update['voice.parts'] = [];
      update['voice.pending'] = [];
      update['voice.operationId'] = '';
      update['voice.track'] = { url: '', duration: 0 };
      update['voice.extraction'] = null;
      update['voice.extractedAt'] = null;
    }
  }

  // A blocked tasting cannot be published again by its owner. Expressed as part
  // of the filter so there is no read-then-write window between the check and
  // the update; the miss is told apart from a genuine 404 below.
  const filter = { sessionId, owner };
  if (publicAccess === true) filter.blocked = { $ne: true };

  // Same rule as creation: the slug is cosmetic and sessionId always resolves,
  // so a collision must not cost the user their edit. The tasting keeps the
  // address it already had.
  TeaForm.findOneAndUpdate(filter, update, { new: true })
    .catch((err) => {
      if (!isDuplicateSlug(err)) throw err;
      console.warn(`Slug collision renaming ${sessionId}; address left unchanged.`);
      const { slug, ...rest } = update;
      return TeaForm.findOneAndUpdate(filter, rest, { new: true });
    })
    .then(async (form) => {
      if (!form && publicAccess === true) {
        const blockedForm = await TeaForm.findOne({ sessionId, owner }).select('blocked');
        if (blockedForm && blockedForm.blocked) {
          const e = new Error(t(req, 'api.blockedCannotPublish'));
          e.statusCode = 403;
          throw e;
        }
      }

      // publicAccess is duplicated onto every brewing, aroma and taste, and the
      // public endpoints filter on each document's own copy. Updating only the
      // teaform published the tasting while leaving its проливы invisible —
      // reachable for any recording, since those are forced private at creation
      // and therefore always published by a later toggle.
      if (typeof publicAccess === 'boolean') {
        await Promise.all([
          Brewing.updateMany({ owner, sessionId }, { publicAccess }),
          Aroma.updateMany({ owner, sessionId }, { publicAccess }),
          Taste.updateMany({ owner, sessionId }, { publicAccess }),
        ]).catch(() => {});
      }

      if (segments && segments.length) enqueue(owner, sessionId);
      return res.send({
        data: form,
      });
    })
    .catch((err) => {
      // The moderation refusal above carries its own status and message; without
      // this it would reach the user as a generic 500.
      if (err.statusCode) {
        next(err);
      } else if (err.name === 'ValidationError') {
        const e = new Error(t(req, 'api.badData'));
        e.statusCode = 400;
        next(e);
      } else {
        const e = new Error(t(req, 'api.default'));
        e.statusCode = 500;
        next(e);
      }
    });
};

// Small polling target for the recorder UI: the merge and the recognition are
// both slower than a request, so the frontend watches this rather than refetching
// the whole tasting every few seconds.
module.exports.getVoiceStatus = (req, res, next) => {
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .select('voice')
    .orFail(() => {
      const e = new Error(t(req, 'api.notFound'));
      e.statusCode = 404;
      return e;
    })
    .then((form) => {
      const voice = form.voice || {};
      res.send({
        data: {
          status: voice.status || 'idle',
          transcript: voice.transcript || '',
          track: voice.track || null,
          error: voice.error || '',
        },
      });
    })
    .catch((err) => {
      if (err.statusCode) return next(err);
      const e = new Error(t(req, 'api.default'));
      e.statusCode = 500;
      return next(e);
    });
};

// Re-runs recognition after a failure. Recognition talks to a third-party
// service over the network, so "fetch failed" is a normal transient outcome —
// without this the form is stuck in `error` for good and the recording is
// effectively lost, even though the audio is sitting safely on disk.
module.exports.retryVoice = (req, res, next) => {
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .select('voice')
    .orFail(() => {
      const e = new Error(t(req, 'api.notFound'));
      e.statusCode = 404;
      return e;
    })
    .then((form) => {
      const segments = (form.voice && form.voice.segments) || [];
      if (!segments.length) {
        const e = new Error(t(req, 'api.noRecordings'));
        e.statusCode = 409;
        throw e;
      }

      // Reset to "queued" and let the ordinary job path do the work: it re-merges
      // from the segments, so a track lost to a half-finished run is rebuilt too.
      return TeaForm.updateOne(
        { owner: req.user._id, sessionId: req.params.sessionId },
        { 'voice.status': 'queued', 'voice.error': '', 'voice.operationId': '' },
      ).then(() => {
        enqueue(req.user._id, req.params.sessionId);
        res.send({ data: { status: 'queued' } });
      });
    })
    .catch((err) => {
      if (err.statusCode) return next(err);
      const e = new Error(t(req, 'api.default'));
      e.statusCode = 500;
      return next(e);
    });
};

// Turns the transcript into field suggestions. Deliberately does NOT write the
// form: the user confirms field by field, so a confident-but-wrong extraction
// costs a rejected suggestion rather than overwritten data.
module.exports.extractFromVoice = (req, res, next) => {
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .select('voice')
    .orFail(() => {
      const e = new Error(t(req, 'api.notFound'));
      e.statusCode = 404;
      return e;
    })
    .then((form) => {
      const voice = form.voice || {};

      // Already extracted: answer from storage. The transcript has not changed,
      // so a second call to YandexGPT would be billed for an identical question
      // and could even come back slightly different.
      if (voice.extraction && voice.extraction.data) {
        res.send({
          data: voice.extraction.data,
          droppedPaths: voice.extraction.droppedPaths || [],
          offTopic: Boolean(voice.extraction.offTopic),
          topic: voice.extraction.topic || '',
          cached: true,
          extractedAt: voice.extractedAt,
        });
        return null;
      }

      // Per пролив when recognition produced parts: the boundaries are the
      // user's own, and handing them over is the difference between the model
      // knowing which пролив a note belongs to and guessing at it.
      //
      // Within each part, the unrewritten text: normalization turns spoken
      // numbers into digits and gets them wrong, and a tasting is mostly
      // numbers with units. Both fall back for recordings made before either
      // existed.
      const parts = (voice.parts || [])
        .map((part) => ({
          brewingNumber: Number(part.brewingNumber) || 0,
          whole: Boolean(part.whole),
          transcript: String(part.transcriptRaw || part.transcript || '').trim(),
        }))
        .filter((part) => part.transcript);

      const source = parts.length
        ? parts
        : (voice.transcriptRaw || voice.transcript || '').trim();

      if (!source.length) {
        const e = new Error('Расшифровка ещё не готова.');
        e.statusCode = 409;
        throw e;
      }

      return extractFromTranscript(source).then((result) => {
        if (!result.ok) {
          const e = new Error(result.reason);
          e.statusCode = 502;
          throw e;
        }

        const stored = {
          data: result.data,
          droppedPaths: result.droppedPaths,
          offTopic: Boolean(result.offTopic),
          topic: result.topic || '',
        };
        // Saved before responding: if the write fails the client would otherwise
        // believe the result is cached and never be able to ask again.
        return TeaForm.updateOne(
          { owner: req.user._id, sessionId: req.params.sessionId },
          { 'voice.extraction': stored, 'voice.extractedAt': new Date() },
        ).then(() => res.send({ ...stored, cached: false }));
      });
    })
    .catch((err) => {
      if (err.statusCode) return next(err);
      const e = new Error(t(req, 'api.default'));
      e.statusCode = 500;
      return next(e);
    });
};

// Best-effort removal of a deleted form's uploaded files — photos, every voice
// segment and the merged track. Runs after the response is on its way: a failed
// unlink must never turn a successful delete into an error. The ownership guard
// is the same one the delete endpoint uses.
const unlinkFormFiles = (urls, ownerId) => {
  urls.forEach((url) => {
    const filename = path.basename(String(url || ''));
    if (!ownsUpload(filename, ownerId)) return;
    fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
  });
};

const formFileUrls = (form) => {
  if (!form) return [];
  const voice = form.voice || {};
  return [
    ...(form.photos || []).map((photo) => photo.url),
    ...(voice.segments || []).map((segment) => segment.url),
    (voice.track && voice.track.url) || '',
  ].filter(Boolean);
};

// Shared with the admin moderation endpoints, which delete other people's
// tastings: the ownership prefix check inside takes the form's owner, not the
// caller, so an admin delete still removes exactly that owner's files.
module.exports.unlinkFormFiles = unlinkFormFiles;
module.exports.formFileUrls = formFileUrls;

module.exports.delTeaFormBySessionID = (req, res, next) => {
  // Read the file list before delBySessionID removes the document.
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .catch(() => null)
    .then((form) => {
      const urls = formFileUrls(form);
      res.on('finish', () => {
        if (res.statusCode < 400) unlinkFormFiles(urls, req.user._id);
      });
      delBySessionID(req, res, next, TeaForm);
    });
};
