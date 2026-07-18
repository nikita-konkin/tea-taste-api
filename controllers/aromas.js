const Aroma = require("../models/aroma");
const AromaDB = require('../models/aromaDB');

const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionIdAndOwner,
  getTeaDataBySessionIdAndPublicAccess
 } = require("../utils/getTeaDataBy")

module.exports.createAroma = (req, res, next) => {
  const { aromaStage1, aromaStage2, aromaStage3, publicAccess } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const aromaCount = req.params.aromaId;

  Aroma.updateMany(
    { aromaCount: aromaCount, brewingCount: brewingCount,
      sessionId: sessionId, owner: owner,
    },
    {
      $set: {
        aromaStage1: aromaStage1,
        aromaStage2: aromaStage2,
        aromaStage3: aromaStage3,
        sessionId: sessionId,
        aromaCount: aromaCount,
        brewingCount: brewingCount,
        owner: owner,
        publicAccess: publicAccess,
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
        next(e);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(e);
      }
    });
};

module.exports.patchAroma = (req, res, next) => {
  const { aromaStage1, aromaStage2, aromaStage3, publicAccess } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  const brewingCount = req.params.brewId;
  const aromaCount = req.params.aromaId;

  Aroma.findOneAndUpdate(
    { aromaCount: aromaCount, brewingCount: brewingCount,
      sessionId: sessionId, owner: owner },
    {
      $set : {
      aromaStage1: aromaStage1,
      aromaStage2: aromaStage2,
      aromaStage3: aromaStage3,
      sessionId: sessionId,
      aromaCount: aromaCount,
      brewingCount: brewingCount,
      owner: owner,
      publicAccess: publicAccess,
    }
    },
    {new : true, runValidators: true}
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
        next(e);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(e);
      }
    });
}

module.exports.getAromas = (req, res, next) => {
  getTeaDataBySessionIdAndOwner(req, res, next, Aroma)
}

module.exports.getPublicAromas = (req, res, next) => {
  getTeaDataBySessionIdAndPublicAccess(req, res, next, Aroma)
}

module.exports.delAromaBySessionID = (req, res, next) => {
  
  delBySessionID(req, res, next, Aroma)

};

module.exports.delAromaSelective = (req, res, next) => {

  const owner = req.user._id;
  const sessionId = req.params.sessionId;

  const brewingCount = req.params.brewId;
  const aromaCount = req.params.aromaId;

  Aroma.deleteMany(
    {
      owner: owner,
      sessionId: sessionId,
      brewingCount: brewingCount,
      aromaCount: aromaCount, 
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


module.exports.getAllFromAromaDB = (req, res, next) => {

  AromaDB.find({})  
  .then((response) =>
    res.send({
      response,
    })
  )
  .catch((err) => {
    const e = new Error(err.message);
    e.statusCode = 500;
    next(e)
  })

}

