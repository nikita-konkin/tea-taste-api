const path = require("path");
const fs = require("fs");

const TeaForm = require("../models/teaform");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionIdAndOwner } = require("../utils/getTeaDataBy")
const { uploadDir } = require("../middlewares/upload");
const { ownsUpload } = require("./uploads");
const { enqueue } = require("../utils/voiceJob");
const { extractFromTranscript } = require("../utils/extractForm");

// Only `segments` is the client's to send. Everything else under `voice` —
// the merged track, the transcript, the recognition status and operation id —
// is written by the background job, and an edit dialog that was opened before
// recognition finished would otherwise save its stale copy back over it.
const clientSegments = (voice) => {
  if (!voice || !Array.isArray(voice.segments)) return undefined;
  return voice.segments.map(({ url, brewingNumber, duration }) => ({
    url,
    brewingNumber: Number(brewingNumber) || 0,
    duration: Number(duration) || 0,
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
    photos,
    voice
  } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  // const brewingCount = req.params.brewId;

  const segments = clientSegments(voice);
  // "queued" is what the transcription job looks for; with no recordings the
  // key is omitted entirely and the model's own default applies.
  const voiceDoc = segments && segments.length
    ? { segments, status: "queued", public: false }
    : undefined;

  // A tasting that carries a recording is never published on creation: the
  // wizard cannot know what else ended up on the tape. Publishing it stays a
  // deliberate act in /my_forms, after the owner has heard it back.
  const publishable = voiceDoc ? false : publicAccess;

  TeaForm.updateMany(
    {
      sessionId: sessionId,
      owner: owner,
    },
    {
      $setOnInsert: {
        nameRU: nameRU,
        country: country,
        shop: shop,
        type: type,
        weight: weight,
        water: water,
        volume: volume,
        temperature: temperature,
        price: price,
        teaware: teaware,
        brewingtype: brewingtype,
        publicAccess: publishable,
        sessionId: sessionId,
        owner: owner,
        averageRating: averageRating,
        photos: photos,
        voice: voiceDoc
      },
    },
    { upsert: true }
  )
    .then((form) => {
      // After the response: merging and recognition take far longer than a
      // request may, and the tasting is saved either way.
      if (voiceDoc) enqueue(owner, sessionId);
      return res.send({
        data: form,
      });
    })
    .catch((err) => {
      if (err.name === "ValidationError") {
        const e = new Error(
          "400 — Переданы некорректные данные."
        );
        e.statusCode = 400;
        next(e);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(e);
      }
    });
};

module.exports.getTeaFormsByID = (req, res, next) => {

  getTeaDataBySessionIdAndOwner(req, res, next, TeaForm)

};

module.exports.getTeaForms = (req, res, next) => {
  const owner = req.user._id;
  TeaForm.find({ owner: owner })
    .then((forms) =>
      res.send({
        data: forms,
      })
    )
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};

// Public feed with pagination, tea-type filter and sorting:
//   ?page=1&limit=10&type=<exact tea type>&sort=date|-date|rating|-rating
module.exports.getPublicTeaForms = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

    const filter = { publicAccess: true };
    if (req.query.type) filter.type = req.query.type;

    const sortMap = {
      date: { createdAt: -1 },
      '-date': { createdAt: 1 },
      rating: { averageRating: -1, createdAt: -1 },
      '-rating': { averageRating: 1, createdAt: -1 },
    };
    const sort = sortMap[req.query.sort] || sortMap.date;

    const [total, forms] = await Promise.all([
      TeaForm.countDocuments(filter),
      TeaForm.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('owner', 'name avatar'),
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

// One public form by sessionId (shareable /blog/:sessionId pages).
module.exports.getPublicTeaFormById = (req, res, next) => {
  TeaForm.findOne({ sessionId: req.params.sessionId, publicAccess: true })
    .populate('owner', 'name avatar')
    .orFail(() => {
      const e = new Error('404 — Запись не найдена.');
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
}

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
    photos,
    voice
  } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;

  const update = {
    nameRU: nameRU,
    country: country,
    shop: shop,
    type: type,
    weight: weight,
    water: water,
    volume: volume,
    temperature: temperature,
    price: price,
    teaware: teaware,
    brewingtype: brewingtype,
    publicAccess: publicAccess,
    averageRating: averageRating,
    // Mongoose drops undefined keys from the cast update, so omitting photos
    // preserves them, while an explicit [] clears them.
    photos: photos
    // $set: {
    // sessionId: sessionId,
    // owner: owner,
  };

  // Sharing the recording is the owner's call and is edited on its own, without
  // touching the segments — so it is handled apart from the block below.
  if (voice && typeof voice.public === "boolean") {
    update["voice.public"] = voice.public;
  }

  const segments = clientSegments(voice);
  if (segments) {
    // Sub-paths, deliberately: assigning `voice` as a whole object would
    // replace the entire subdocument and take the transcript and merged track
    // with it, even though the client never sent either.
    update["voice.segments"] = segments;
    update["voice.status"] = segments.length ? "queued" : "idle";
    update["voice.error"] = "";
    if (!segments.length) {
      update["voice.transcript"] = "";
      update["voice.operationId"] = "";
      update["voice.track"] = { url: "", duration: 0 };
    }
  }

  TeaForm.findOneAndUpdate(
    {
      sessionId: sessionId,
      owner: owner,
    },
    update,
    {new : true}
    )
    .then((form) => {
      if (segments && segments.length) enqueue(owner, sessionId);
      return res.send({
        data: form,
      });
    })
    .catch((err) => {
      if (err.name === "ValidationError") {
        const e = new Error(
          "400 — Переданы некорректные данные."
        );
        e.statusCode = 400;
        next(e);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(e);
      }
    });
}

// Small polling target for the recorder UI: the merge and the recognition are
// both slower than a request, so the frontend watches this rather than refetching
// the whole tasting every few seconds.
module.exports.getVoiceStatus = (req, res, next) => {
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .select("voice")
    .orFail(() => {
      const e = new Error("404 — Запись не найдена.");
      e.statusCode = 404;
      return e;
    })
    .then((form) => {
      const voice = form.voice || {};
      res.send({
        data: {
          status: voice.status || "idle",
          transcript: voice.transcript || "",
          track: voice.track || null,
          error: voice.error || "",
        },
      });
    })
    .catch((err) => {
      if (err.statusCode) return next(err);
      const e = new Error("500 — Ошибка по умолчанию.");
      e.statusCode = 500;
      return next(e);
    });
};

// Turns the transcript into field suggestions. Deliberately does NOT write the
// form: the user confirms field by field, so a confident-but-wrong extraction
// costs a rejected suggestion rather than overwritten data.
module.exports.extractFromVoice = (req, res, next) => {
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .select("voice")
    .orFail(() => {
      const e = new Error("404 — Запись не найдена.");
      e.statusCode = 404;
      return e;
    })
    .then((form) => {
      const transcript = (form.voice && form.voice.transcript) || "";
      if (!transcript.trim()) {
        const e = new Error("Расшифровка ещё не готова.");
        e.statusCode = 409;
        throw e;
      }
      return extractFromTranscript(transcript);
    })
    .then((result) => {
      if (!result.ok) {
        const e = new Error(result.reason);
        e.statusCode = 502;
        throw e;
      }
      res.send({ data: result.data, droppedPaths: result.droppedPaths });
    })
    .catch((err) => {
      if (err.statusCode) return next(err);
      const e = new Error("500 — Ошибка по умолчанию.");
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
    const filename = path.basename(String(url || ""));
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
    (voice.track && voice.track.url) || "",
  ].filter(Boolean);
};

module.exports.delTeaFormBySessionID = (req, res, next) => {

  // Read the file list before delBySessionID removes the document.
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .catch(() => null)
    .then((form) => {
      const urls = formFileUrls(form);
      res.on("finish", () => {
        if (res.statusCode < 400) unlinkFormFiles(urls, req.user._id);
      });
      delBySessionID(req, res, next, TeaForm);
    });

};