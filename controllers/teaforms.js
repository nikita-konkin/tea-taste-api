const TeaForm = require("../models/teaform");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");

module.exports.createTeaForm = (req, res, next) => {
  const {
    nameRU,
    type,
    weight,
    water,
    volume,
    temperature,
    teaware,
    brewingtype,
    country,
  } = req.body;
  // const { aromas, tastes, description, brewingRating, brewingTime } = req.body;

  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  // const brewingCount = req.params.brewId;

  TeaForm.update(
    {
      sessionId: sessionId,
      owner: owner,
    },
    {
      $setOnInsert: {
        nameRU: nameRU,
        type: type,
        weight: weight,
        water: water,
        volume: volume,
        temperature: temperature,
        teaware: teaware,
        brewingtype: brewingtype,
        country: country,
        sessionId: sessionId,
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


module.exports.delTeaFormBySessionID = (req, res, next) => {
  
  delBySessionID(req, res, next, TeaForm)

};

module.exports.getTeaFormsByID = (req, res, next) => {
  const owner = req.user._id;
  const sessionId = req.params.sessionId;
  TeaForm.find({ owner: owner, sessionId: sessionId })
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
