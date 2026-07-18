const mongoose = require('mongoose');

// Tests run against a dedicated database (never the production one).
// Override with API_MONGO_URI, e.g. mongodb://mongo:27017/tea-taste-test
// in the sandbox test container.
const uri = process.env.API_MONGO_URI || 'mongodb://localhost:27017/tea-taste-test';

module.exports.connect = () => mongoose.connect(uri);

module.exports.clear = async () => {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
};

module.exports.close = () => mongoose.connection.close();
