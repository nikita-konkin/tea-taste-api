const Brewing = require("../models/brewing");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionId } = require("../utils/getTeaDataBySessionId")


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
          "400 — Переданы некорректные данные."
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

module.exports.patchBrew = (req, res, next) => {
  const { description, brewingRating, brewingTime } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;

  Brewing.findOneAndUpdate(
    { sessionId: sessionId, brewingCount: brewingCount },
    {
      description: description,
      brewingRating: brewingRating,
      brewingTime: brewingTime,
      sessionId: sessionId,
      brewingCount: brewingCount,
      owner: owner,
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
        next(err);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(err);
      }
    });
};

module.exports.getBrews = (req, res, next) => {

  getTeaDataBySessionId(req, res, next, Brewing)

};

module.exports.delBrewsBySessionID = (req, res, next) => {
  
  delBySessionID(req, res, next, Brewing)

};