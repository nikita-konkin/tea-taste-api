const Aroma = require("../models/aroma");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionId } = require("../utils/getTeaDataBySessionId")

module.exports.createAroma = (req, res, next) => {
  const { aromaStage1, aromaStage2, aromaStage3 } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const aromaCount = req.params.aromaId;

  Aroma.update(
    { aromaCount: aromaCount, brewingCount: brewingCount,
      sessionId: sessionId, brewingCount: brewingCount },
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
          "400 — Переданы некорректные данные."
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

module.exports.patchAroma = (req, res, next) => {
  const { aromaStage1, aromaStage2, aromaStage3 } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const aromaCount = req.params.aromaId;

  Aroma.findOneAndUpdate(
    { aromaCount: aromaCount, brewingCount: brewingCount,
      sessionId: sessionId, brewingCount: brewingCount },
    {
      aromaStage1: aromaStage1,
      aromaStage2: aromaStage2,
      aromaStage3: aromaStage3,
      sessionId: sessionId,
      aromaCount: aromaCount,
      brewingCount: brewingCount,
      owner: owner,
    },
    {new : true}
  )
    .then((aroma) =>
      res.send({
        data: aroma,
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
        next(e);
      }
    });
}

module.exports.getAromas = (req, res, next) => {

  getTeaDataBySessionId(req, res, next, Aroma)

}


module.exports.delAromaBySessionID = (req, res, next) => {
  
  delBySessionID(req, res, next, Aroma)

};