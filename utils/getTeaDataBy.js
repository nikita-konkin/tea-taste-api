module.exports.getTeaDataBySessionIdAndOwner = (req, res, next, schema) => {
  const owner = req.user._id;
  const sessionId = req.params.sessionId;

  schema.find({ owner: owner, sessionId: sessionId })
    .then((response) =>
      res.send({
        data: response,
      })
    )
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};

module.exports.getTeaDataBySessionIdAndPublicAccess = (req, res, next, schema) => {
  const sessionId = req.params.sessionId;

  schema.find({ sessionId: sessionId, publicAccess: true })
    .then((response) =>
      res.send({
        data: response,
      })
    )
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};
