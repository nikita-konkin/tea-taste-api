const Brewing = require("../models/brewing");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");

module.exports.createBrew = (req, res, next) => {
  const { description, brewingRating, brewingTime } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;

  Brewing.updateMany(
    { sessionId: sessionId, brewingCount: brewingCount },
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
      },
    },
    { upsert: true }
  )
    .then((brew) =>
      res.send({
        data: brew,
      })
    )
    .catch((err) => {
      if (err.name === "ValidationError") {
        const e = new Error(
          "400 — Переданы некорректные данные при создании карточки фильма."
        );
        e.statusCode = 400;
        next(err);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(err);
      }
    });
};

module.exports.getBrews = (req, res, next) => {
  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  Brewing.find({ $and: [{ owner: owner }, { sessionId: sessionId }] })
    .then((brews) =>
      res.send({
        data: brews,
      })
    )
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};

module.exports.delBrewsBySessionID = (req, res, next) => {
  
  delBySessionID(req, res, next, Brewing)

};