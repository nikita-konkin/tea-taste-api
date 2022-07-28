module.exports.getTeaDataBySessionId = (req, res, nex, schema) => {
  const owner = req.user._id;
  const sessionId = req.params.sessionId;

  schema.find({ $and: [{owner: owner}, {sessionId:sessionId}]})
    .then((response) =>
      res.send({
        data: response,
      })
    )
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode - 500;
      next(e)
    })
}