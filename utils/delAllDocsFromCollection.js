module.exports.delBySessionID = (req, res, next, schema) => {
  const sessionId = req.params.sessionId;
  const owner = req.user._id;

  schema.findOne({
    owner: owner,
    sessionId: sessionId,
  })
    .orFail(() => {
      const e = new Error("404 — Запись не найдена.");
      e.statusCode = 404;
      return e;
    })
    .then(() =>
      schema.deleteMany({
        owner: owner,
        sessionId: sessionId,
      })
    )
    .then((data) => {
      res.send({
        data,
      });
    })
    .catch((err) => {
      if (err.statusCode) {
        next(err);
      } else if (err.name === "CastError") {
        const e = new Error("400 — Переданы некорректные данные.");
        e.statusCode = 400;
        next(e);
      } else {
        const e = new Error("500 — Ошибка по умолчанию.");
        e.statusCode = 500;
        next(e);
      }
    });
};
