const Taste = require("../models/taste");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");

module.exports.createTaste = (req, res, next) => {
  const { tasteStage1, tasteStage2 } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const tasteCount = req.params.tasteId;

  Taste.update(
    { tasteCount: tasteCount, brewingCount: brewingCount },
    {
      $setOnInsert: {
        tasteStage1: tasteStage1,
        tasteStage2: tasteStage2,
        sessionId: sessionId,
        tasteCount: tasteCount,
        brewingCount: brewingCount,
        owner: owner,
      },
    },
    { upsert: true }
  )
    .then((taste) =>
      res.send({
        data: taste,
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
        next(e);
      }
    });
};

module.exports.delTasteBySessionID = (req, res, next) => {
  delBySessionID(req, res, next, Taste);
};
