const User = require('../models/user');
const Teaform = require('../models/teaform');
const Brewing = require('../models/brewing');
const Aroma = require('../models/aroma');
const Taste = require('../models/taste');
const { MONTHLY_LIMIT_SECONDS, currentPeriod } = require('../utils/voiceQuota');
const { getSettings, updateSettings } = require('../utils/settings');
const { unlinkFormFiles, formFileUrls } = require('./teaforms');
const { t } = require('../utils/apiMessages');

const fail = (next, statusCode, message) => next({ message, statusCode });

// GET /admin/users — every account with its tea-form count, newest first.
module.exports.getUsers = async (req, res, next) => {
  try {
    const [users, counts] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }).limit(500),
      Teaform.aggregate([{ $group: { _id: '$owner', forms: { $sum: 1 } } }]),
    ]);
    const formsByOwner = Object.fromEntries(counts.map((c) => [String(c._id), c.forms]));
    const period = currentPeriod();

    res.send({
      // The monthly allowance is spent against the service owner's SpeechKit
      // bill, so it is reported alongside the accounts rather than left to be
      // read out of the database by hand when something looks expensive.
      voiceLimitSeconds: MONTHLY_LIMIT_SECONDS,
      voicePeriod: period,
      data: users.map((u) => ({
        _id: u._id,
        name: u.name,
        nickname: u.nickname,
        email: u.email,
        career: u.career,
        avatar: u.avatar,
        vkId: u.vkId,
        role: u.role || 'user',
        createdAt: u.createdAt,
        forms: formsByOwner[String(u._id)] || 0,
        // voiceSeconds is only meaningful within its own period; a counter left
        // over from an earlier month has already been forgiven, so it reads 0
        // here exactly as it does to the quota check itself.
        voiceSeconds: u.voicePeriod === period ? (u.voiceSeconds || 0) : 0,
      })),
    });
  } catch (err) {
    console.error('admin getUsers failed:', err);
    fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// GET /admin/settings — the whole switchboard, admin-only.
module.exports.getAppSettings = async (req, res, next) => {
  try {
    const settings = await getSettings();
    return res.send({ data: { registrationOpen: settings.registrationOpen } });
  } catch (err) {
    console.error('admin getAppSettings failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// PATCH /admin/settings — flip a switch. Sent one key at a time, so an admin
// page that predates a new setting cannot reset it by echoing back a stale copy.
module.exports.updateAppSettings = async (req, res, next) => {
  try {
    const patch = {};
    if (typeof req.body.registrationOpen === 'boolean') {
      patch.registrationOpen = req.body.registrationOpen;
    }
    const settings = await updateSettings(patch);
    return res.send({ data: { registrationOpen: settings.registrationOpen } });
  } catch (err) {
    console.error('admin updateAppSettings failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// GET /admin/forms?blocked=true — the moderation queue. Blocked tastings are
// gone from the feed, so this list is the only way back to them: without it a
// block would be as irreversible as a delete.
module.exports.getForms = async (req, res, next) => {
  try {
    const filter = req.query.blocked === 'true' ? { blocked: true } : {};

    const forms = await Teaform.find(filter)
      .sort({ blockedAt: -1, createdAt: -1 })
      .limit(200)
      .select('sessionId nameRU type createdAt publicAccess blocked blockedAt owner')
      .populate('owner', 'name nickname email');

    return res.send({
      data: forms.map((form) => ({
        sessionId: form.sessionId,
        nameRU: form.nameRU,
        type: form.type,
        createdAt: form.createdAt,
        publicAccess: form.publicAccess,
        blocked: Boolean(form.blocked),
        blockedAt: form.blockedAt,
        owner: form.owner
          ? {
            _id: form.owner._id,
            name: form.owner.name,
            nickname: form.owner.nickname,
            email: form.owner.email,
          }
          : null,
      })),
    });
  } catch (err) {
    console.error('admin getForms failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// PATCH /admin/forms/:sessionId/block — take a tasting out of the feed, or put
// it back within reach of its owner.
//
// Blocking also clears publicAccess on the tasting and on every brewing, aroma
// and taste: the public sub-resource endpoints filter on each document's own
// copy, so leaving those true would keep the проливы of a blocked tasting
// readable at /public-brewings/:sessionId. Unblocking does NOT republish — the
// owner decides that, and a moderated post should not silently reappear.
module.exports.setFormBlocked = async (req, res, next) => {
  const { sessionId } = req.params;
  const { blocked } = req.body;

  try {
    const form = await Teaform.findOne({ sessionId });
    if (!form) return fail(next, 404, 'Запись не найдена.');

    const patch = blocked
      ? {
        blocked: true,
        blockedAt: new Date(),
        blockedBy: req.user._id,
        publicAccess: false,
        'voice.public': false,
      }
      : { blocked: false, blockedAt: null, blockedBy: null };

    await Teaform.updateOne({ sessionId }, patch);

    if (blocked) {
      const scope = { sessionId, owner: form.owner };
      await Promise.all([
        Brewing.updateMany(scope, { publicAccess: false }),
        Aroma.updateMany(scope, { publicAccess: false }),
        Taste.updateMany(scope, { publicAccess: false }),
      ]).catch(() => {});
    }

    return res.send({ data: { sessionId, blocked: Boolean(blocked) } });
  } catch (err) {
    console.error('admin setFormBlocked failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// DELETE /admin/forms/:sessionId — remove someone else's tasting outright, with
// its проливы, descriptors and uploaded files. Same cascade as the owner's own
// delete; the files are unlinked after the response, and against the form's
// owner id, since that is what the upload filenames are prefixed with.
module.exports.deleteForm = async (req, res, next) => {
  const { sessionId } = req.params;

  try {
    const form = await Teaform.findOne({ sessionId });
    if (!form) return fail(next, 404, 'Запись не найдена.');

    const { owner } = form;
    const urls = formFileUrls(form);

    await Promise.all([
      Teaform.deleteOne({ sessionId, owner }),
      Brewing.deleteMany({ sessionId, owner }),
      Aroma.deleteMany({ sessionId, owner }),
      Taste.deleteMany({ sessionId, owner }),
    ]);

    res.on('finish', () => {
      if (res.statusCode < 400) unlinkFormFiles(urls, owner);
    });

    return res.send({ ok: true, message: t(req, 'api.formDeleted') });
  } catch (err) {
    console.error('admin deleteForm failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// PATCH /admin/users/:id/role — promote or demote an account.
module.exports.setUserRole = async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  if (String(req.user._id) === id) {
    return fail(next, 409, 'Нельзя изменить собственную роль.');
  }

  try {
    const user = await User.findByIdAndUpdate(id, { role }, { new: true, runValidators: true });
    if (!user) return fail(next, 404, 'Пользователь не найден.');
    return res.send({ data: { _id: user._id, role: user.role } });
  } catch (err) {
    console.error('admin setUserRole failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};

// DELETE /admin/users/:id — remove an account and all of its tea data.
// Admin accounts are protected: demote them first.
module.exports.deleteUser = async (req, res, next) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) return fail(next, 404, 'Пользователь не найден.');
    if (user.role === 'admin') {
      return fail(next, 403, 'Нельзя удалить администратора — сначала снимите роль.');
    }

    await Promise.all([
      Teaform.deleteMany({ owner: id }),
      Brewing.deleteMany({ owner: id }),
      Aroma.deleteMany({ owner: id }),
      Taste.deleteMany({ owner: id }),
    ]);
    await User.deleteOne({ _id: id });

    return res.send({ ok: true, message: t(req, 'api.userDeleted') });
  } catch (err) {
    console.error('admin deleteUser failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};
