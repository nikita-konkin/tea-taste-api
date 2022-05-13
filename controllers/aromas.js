const Aroma = require("../models/aroma");

module.exports.createAroma = (req, res, next) => {
  const { aromaStage1, aromaStage2, aromaStage3 } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const aromaCount = req.params.aromaId;

  Aroma.update(
    { aromaCount: aromaCount },
    {
      $setOnInsert: {
        aromaStage1: aromaStage1,
        aromaStage2: aromaStage2,
        aromaStage3: aromaStage3,
        sessionId: sessionId,
        aromaCount: aromaCount,
        brewingCount: brewingCount,
        owner: owner,
      },
    },
    { upsert: true }
  )
    .then((aroma) =>
      res.send({
        data: aroma,
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
