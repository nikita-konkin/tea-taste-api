const mongoose = require('mongoose');
const Aroma = require('../models/aroma');
const Taste = require('../models/taste');

const TOP_LIMIT = 8;

// The user's most frequently used descriptor paths for one collection.
// Matches both the legacy array owner and the migrated single ObjectId.
const topFor = (Model, prefix, ownerId) => Model.aggregate([
  { $match: { owner: new mongoose.Types.ObjectId(ownerId) } },
  {
    $group: {
      _id: { s1: `$${prefix}1`, s2: `$${prefix}2`, s3: `$${prefix}3` },
      count: { $sum: 1 },
    },
  },
  { $sort: { count: -1, _id: 1 } },
  { $limit: TOP_LIMIT },
]).then((rows) => rows
  .map((r) => ({
    stages: [r._id.s1, r._id.s2, r._id.s3]
      .map((s) => (s && s !== 'none' ? s : null)),
    count: r.count,
  }))
  .filter((r) => r.stages[0]));

// GET /my-descriptors — quick-pick data for the Stage-2 picker.
module.exports.getMyTopDescriptors = (req, res, next) => {
  Promise.all([
    topFor(Aroma, 'aromaStage', req.user._id),
    topFor(Taste, 'tasteStage', req.user._id),
  ])
    .then(([aromas, tastes]) => res.send({ aromas, tastes }))
    .catch((err) => {
      const e = new Error(err.message);
      e.statusCode = 500;
      next(e);
    });
};
