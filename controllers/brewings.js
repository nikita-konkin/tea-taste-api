const Brewing = require("../models/brewing");
const Aroma = require("../models/aroma");
const Taste = require("../models/taste");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionIdAndOwner, 
  getTeaDataBySessionIdAndPublicAccess
 } = require("../utils/getTeaDataBy")


module.exports.createBrew = (req, res, next) => {
  const { description, brewingRating, brewingTime, publicAccess } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;

  Brewing.updateMany(
    { sessionId: sessionId, brewingCount: brewingCount, owner: owner },
    {
      $setOnInsert: {
        // aromas: aromas,
        // tastes: tastes,
        description: description,
        brewingRating: brewingRating,
        brewingTime: brewingTime,
        sessionId: sessionId,
        brewingCount: brewingCount,
        owner: owner,
        publicAccess: publicAccess,
      },
    },
    { upsert: true }
  )
    .then((brew) =>
      res.send({
        brew,
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

module.exports.patchBrew = (req, res, next) => {
  const { description, brewingRating, brewingTime, publicAccess } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;

  Brewing.findOneAndUpdate(
    { sessionId: sessionId, brewingCount: brewingCount, owner: owner },
    {
      description: description,
      brewingRating: brewingRating,
      brewingTime: brewingTime,
      sessionId: sessionId,
      brewingCount: brewingCount,
      owner: owner,
      publicAccess: publicAccess,
    },
    { new: true }
  )
    .then((brew) =>
      res.send({
        data: brew,
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

module.exports.getBrews = (req, res, next) => {
  getTeaDataBySessionIdAndOwner(req, res, next, Brewing)
};

module.exports.getPublicBrews = (req, res, next) => {
  getTeaDataBySessionIdAndPublicAccess(req, res, next, Brewing)
};

module.exports.delBrewsBySessionID = (req, res, next) => {

  delBySessionID(req, res, next, Brewing)

};

// Deletes ONE brewing of a session together with its aroma/taste records.
module.exports.delBrewSelective = (req, res, next) => {
  const owner = req.user._id;
  const { sessionId, brewId } = req.params;
  const filter = { owner: owner, sessionId: sessionId, brewingCount: brewId };

  Promise.all([
    Brewing.deleteMany(filter),
    Aroma.deleteMany(filter),
    Taste.deleteMany(filter),
  ])
    .then(([brews, aromas, tastes]) => {
      if (brews.deletedCount === 0) {
        const e = new Error("404 — Запись не найдена.");
        e.statusCode = 404;
        return next(e);
      }
      return res.send({
        data: {
          brewings: brews.deletedCount,
          aromas: aromas.deletedCount,
          tastes: tastes.deletedCount,
        },
      });
    })
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};