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
      next(e);
    })
    .then((response) => {
      if (response) {
        schema.remove({
          owner: owner,
          sessionId: sessionId,
        }).then((data) => {
          res.send({
            data,
          });
          return data;
        });
      } else {
        const e = new Error("403 — Запрещено.");
        e.statusCode = 403;
        next(e);
      }
    })
    .catch((err) => {
      if (err.name === "CastError") {
        const e = new Error(
          "400 — Переданы некорректные данные для удаления карточки."
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