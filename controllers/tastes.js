const Taste = require("../models/taste");
const TasteDB = require('../models/tasteDB');
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionId } = require("../utils/getTeaDataBySessionId");

module.exports.createTaste = (req, res, next) => {
  const { tasteStage1, tasteStage2, tasteStage3 } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const tasteCount = req.params.tasteId;

  Taste.updateMany(
    { tasteCount: tasteCount, brewingCount: brewingCount,
      sessionId: sessionId, brewingCount: brewingCount },
    {
      $setOnInsert: {
        tasteStage1: tasteStage1,
        tasteStage2: tasteStage2,
        tasteStage3: tasteStage3,
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

module.exports.patchTaste = (req, res, next) => {
  const { tasteStage1, tasteStage2,  tasteStage3} = req.body;
  // const { tasteStage2 } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const tasteCount = req.params.tasteId;

  Taste.findOneAndUpdate(
    { tasteCount: tasteCount, brewingCount: brewingCount,
      sessionId: sessionId, brewingCount: brewingCount },
    {$set : {
      tasteStage1: tasteStage1,
      tasteStage2: tasteStage2,
      tasteStage3: tasteStage3,
      sessionId: sessionId,
      tasteCount: tasteCount,
      brewingCount: brewingCount,
      owner: owner,
    }},
    {new : true, runValidators: true }
  )
    .then((taste) =>
      res.send({
        data: taste,
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

module.exports.getTastes = (req, res, next) => {

  getTeaDataBySessionId(req, res, next, Taste)

}

module.exports.delTasteBySessionID = (req, res, next) => {

  delBySessionID(req, res, next, Taste);

};

module.exports.delTasteSelective = (req, res, next) => {

  const owner = req.user._id;
  const sessionId = req.params.sessionId;

  const brewingCount = req.params.brewId;
  const tasteCount = req.params.tasteId;

  Taste.deleteMany(
    {
      owner: owner,
      sessionId: sessionId,
      brewingCount: brewingCount,
      tasteCount: tasteCount, 
    }
  )
  .then(
    (response) => 
    {res.send({
      data: response,
    });
    return response;
    })
  .catch( (err) => {
    if (err.name === "ValidationError") {
      const e = new Error(
        "400 — Переданы некорректные данные."
        );
      e.statusCode = 400;
      next(e);
    }  else {
      const e = new Error("500 — Ошибка по умолчанию.");
      e.statusCode = 500;
      next(e);
    }
  });
}

module.exports.getAllFromTasteDB = (req, res, next) => {

  TasteDB.find({})  
  .then((response) =>
    res.send({
      response,
    })
  )
  .catch((err) => {
    const e = new Error(err.message);
    e.statusCode - 500;
    next(e)
  })

}