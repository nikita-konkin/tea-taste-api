const Setting = require('../models/setting');

const KEY = 'app';

// Defaults live here rather than only on the schema: the document does not
// exist until an admin changes something, and every reader needs the same
// answer for a site that has never been configured.
const DEFAULTS = {
  registrationOpen: true,
};

// Read-only, and deliberately not an upsert: this is reachable unauthenticated
// from the sign-up page, and an anonymous GET should not write to the database.
const getSettings = async () => {
  const doc = await Setting.findOne({ key: KEY }).lean();
  return { ...DEFAULTS, ...(doc || {}) };
};

// The write path is the one that creates the document.
const updateSettings = async (patch) => {
  const doc = await Setting.findOneAndUpdate(
    { key: KEY },
    { ...patch, $setOnInsert: { key: KEY } },
    { new: true, upsert: true, runValidators: true },
  ).lean();
  return { ...DEFAULTS, ...doc };
};

// Fails open on a database error. That is not a hole: the very next step of
// every caller is a write to the same database, so a Mongo that cannot answer
// this question cannot create an account either.
const isRegistrationOpen = async () => {
  try {
    const settings = await getSettings();
    return settings.registrationOpen !== false;
  } catch (err) {
    console.error('Could not read app settings:', err.message);
    return true;
  }
};

const REGISTRATION_CLOSED_MESSAGE = 'Регистрация временно закрыта. Попробуйте позже.';

module.exports = {
  getSettings,
  updateSettings,
  isRegistrationOpen,
  REGISTRATION_CLOSED_MESSAGE,
};
