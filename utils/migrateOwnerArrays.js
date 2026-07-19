// One-time migration: owner used to be an array of ObjectIds holding exactly
// one element; the models now use a single ObjectId. Converts every document
// whose owner is still an array. Safe to run repeatedly (idempotent).
//
//   API_MONGO_URI=mongodb://localhost:27017/teadb node utils/migrateOwnerArrays.js
//   # or inside the container:
//   docker compose exec tea-backend node utils/migrateOwnerArrays.js

require('dotenv').config();
const mongoose = require('mongoose');

const collections = ['teaforms', 'brewings', 'aromas', 'tastes'];
const uri = process.env.API_MONGO_URI || 'mongodb://localhost:27017/teadb';

(async () => {
  try {
    await mongoose.connect(uri);
    console.log('Connected to', uri);

    for (const name of collections) {
      const res = await mongoose.connection.db.collection(name).updateMany(
        { owner: { $type: 'array' } },
        [{ $set: { owner: { $first: '$owner' } } }]
      );
      console.log(`${name}: migrated ${res.modifiedCount} document(s)`);
    }

    await mongoose.connection.close();
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
