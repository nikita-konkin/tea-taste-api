const User = require('../models/user');
const Teaform = require('../models/teaform');
const Brewing = require('../models/brewing');
const Aroma = require('../models/aroma');
const Taste = require('../models/taste');

const fail = (next, statusCode, message) => next({ message, statusCode });

// GET /admin/users — every account with its tea-form count, newest first.
module.exports.getUsers = async (req, res, next) => {
  try {
    const [users, counts] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }).limit(500),
      Teaform.aggregate([{ $group: { _id: '$owner', forms: { $sum: 1 } } }]),
    ]);
    const formsByOwner = Object.fromEntries(counts.map((c) => [String(c._id), c.forms]));

    res.send({
      data: users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        career: u.career,
        avatar: u.avatar,
        vkId: u.vkId,
        role: u.role || 'user',
        createdAt: u.createdAt,
        forms: formsByOwner[String(u._id)] || 0,
      })),
    });
  } catch (err) {
    console.error('admin getUsers failed:', err);
    fail(next, 500, 'Ошибка по умолчанию.');
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

    return res.send({ ok: true, message: 'Пользователь и его данные удалены.' });
  } catch (err) {
    console.error('admin deleteUser failed:', err);
    return fail(next, 500, 'Ошибка по умолчанию.');
  }
};
