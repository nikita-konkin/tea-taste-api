const path = require("path");
const fs = require("fs");

const TeaForm = require("../models/teaform");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionIdAndOwner } = require("../utils/getTeaDataBy")
const { uploadDir } = require("../middlewares/upload");
const { ownsUpload } = require("./uploads");

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
    photos
  } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  // const brewingCount = req.params.brewId;

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
        publicAccess: publicAccess,
        sessionId: sessionId,
        owner: owner,
        averageRating: averageRating,
        photos: photos
      },
    },
    { upsert: true }
  )
    .then((form) =>
      res.send({
        data: form,
      })
    )
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
      data: forms,
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
    .then((form) => res.send({ data: form }))
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
    photos
  } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;

  TeaForm.findOneAndUpdate(
    {
      sessionId: sessionId,
      owner: owner,
    },
    {
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
    },
    {new : true}
    )
    .then((form) =>
      res.send({
        data: form,
      })
    )
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

// Best-effort removal of a deleted form's photo files. Runs after the response
// is on its way: a failed unlink must never turn a successful delete into an
// error. The ownership guard is the same one the delete endpoint uses.
const unlinkFormPhotos = (photos, ownerId) => {
  (photos || []).forEach((photo) => {
    const filename = path.basename(String(photo.url || ""));
    if (!ownsUpload(filename, ownerId)) return;
    fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {});
  });
};

module.exports.delTeaFormBySessionID = (req, res, next) => {

  // Read the photo list before delBySessionID removes the document.
  TeaForm.findOne({ owner: req.user._id, sessionId: req.params.sessionId })
    .catch(() => null)
    .then((form) => {
      const photos = form ? form.photos : [];
      res.on("finish", () => {
        if (res.statusCode < 400) unlinkFormPhotos(photos, req.user._id);
      });
      delBySessionID(req, res, next, TeaForm);
    });

};