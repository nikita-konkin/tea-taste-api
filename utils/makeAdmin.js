// Promote an existing account to admin (or back to user with --demote).
//
//   docker compose exec tea-backend node utils/makeAdmin.js you@example.com
//   docker compose exec tea-backend node utils/makeAdmin.js you@example.com --demote

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

const email = process.argv[2];
const role = process.argv.includes('--demote') ? 'user' : 'admin';
const uri = process.env.API_MONGO_URI || 'mongodb://localhost:27017/teadb';

if (!email) {
  console.error('Usage: node utils/makeAdmin.js <email> [--demote]');
  process.exit(1);
}

(async () => {
  try {
    await mongoose.connect(uri);
    const user = await User.findOneAndUpdate({ email }, { role }, { new: true });
    if (!user) {
      console.error(`No user with email ${email}`);
      process.exit(1);
    }
    console.log(`${user.email} is now: ${user.role}`);
    await mongoose.connection.close();
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
})();
