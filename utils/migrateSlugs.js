// One-time migration: give every tasting written before the `slug` field a
// readable public address, derived from its name and sessionId.
//
// Until a document has one it still resolves by sessionId — nothing breaks
// without this — but it keeps the opaque /blog/<uuid> URL, stays in the sitemap
// under that URL, and gains nothing from its own name. Safe to run repeatedly
// (idempotent): only documents with no slug are touched.
//
//   API_MONGO_URI=mongodb://localhost:27017/teadb node utils/migrateSlugs.js
//   # or inside the container:
//   docker compose exec tea-backend node utils/migrateSlugs.js

require('dotenv').config();
const mongoose = require('mongoose');
const { buildSlug } = require('./slugify');

const uri = process.env.API_MONGO_URI || 'mongodb://localhost:27017/teadb';

(async () => {
  try {
    await mongoose.connect(uri);
    console.log('Connected to', uri);

    const forms = mongoose.connection.db.collection('teaforms');
    const pending = await forms
      .find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] })
      .project({ sessionId: 1, nameRU: 1 })
      .toArray();

    console.log(`${pending.length} document(s) without a slug`);

    let written = 0;
    const skipped = [];
    // Written one at a time rather than in a bulk op: the unique index is the
    // thing being relied on here, and a bulk write would report one failure for
    // a batch instead of telling us which tasting could not be given an address.
    for (const form of pending) {
      const slug = buildSlug(form.nameRU, form.sessionId);
      if (!slug) {
        skipped.push(`${form._id} (no sessionId)`);
        continue;
      }
      try {
        await forms.updateOne({ _id: form._id }, { $set: { slug } });
        written += 1;
      } catch (err) {
        skipped.push(`${form._id} -> ${slug}: ${err.message}`);
      }
    }

    console.log(`teaforms: wrote ${written} slug(s)`);
    if (skipped.length) {
      console.log(`skipped ${skipped.length}:`);
      skipped.forEach((s) => console.log(`  ${s}`));
    }

    await mongoose.connection.close();
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
