const TeaForm = require("../models/teaform");
const { delBySessionID } = require("../utils/delAllDocsFromCollection");
const { getTeaDataBySessionIdAndOwner } = require("../utils/getTeaDataBy")

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
    averageRating
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
        averageRating: averageRating
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

module.exports.getPublicTeaForms = (req, res, next) => {
  TeaForm.find({ publicAccess: true })
    .populate('owner', 'name avatar')
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
    averageRating
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
      averageRating: averageRating
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

module.exports.delTeaFormBySessionID = (req, res, next) => {
  
  delBySessionID(req, res, next, TeaForm)

};