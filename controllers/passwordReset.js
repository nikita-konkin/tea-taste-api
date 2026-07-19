const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Sends the reset link by SMTP when configured; otherwise logs it so the
// operator can relay it manually (and non-production responses include the
// token for testing).
async function deliverResetLink(email, link) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST) {
    console.log(`Password reset requested for ${email}: ${link}`);
    return;
  }

  // Lazy require: nodemailer is only needed when SMTP is configured.
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 465,
    secure: (Number(SMTP_PORT) || 465) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  await transport.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: email,
    subject: 'Восстановление пароля — Форма Чая',
    text: `Вы запросили восстановление пароля на teaform.\n\n`
      + `Перейдите по ссылке, чтобы задать новый пароль (действует 1 час):\n${link}\n\n`
      + `Если вы не запрашивали восстановление — просто проигнорируйте это письмо.`,
  });
}

module.exports.requestPasswordReset = async (req, res, next) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    // Always answer 200 so the endpoint can't be used to enumerate emails.
    if (!user) {
      return res.send({ ok: true, message: 'Если такой email зарегистрирован, ссылка отправлена.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await User.updateOne(
      { _id: user._id },
      {
        passwordResetToken: hashToken(token),
        passwordResetExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      }
    );

    const base = process.env.FRONTEND_URL || 'https://teaform.ru';
    const link = `${base}/reset-password?token=${token}`;
    await deliverResetLink(email, link);

    const payload = { ok: true, message: 'Если такой email зарегистрирован, ссылка отправлена.' };
    if (process.env.NODE_ENV !== 'production') {
      payload.resetToken = token; // testing convenience outside production
    }
    return res.send(payload);
  } catch (err) {
    console.error('Password reset request failed:', err);
    const e = new Error('500 — Ошибка по умолчанию.');
    e.statusCode = 500;
    return next(e);
  }
};

module.exports.confirmPasswordReset = async (req, res, next) => {
  const { token, newPassword } = req.body;

  try {
    const user = await User.findOne({
      passwordResetToken: hashToken(token),
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      const e = new Error('Ссылка недействительна или устарела. Запросите восстановление заново.');
      e.statusCode = 400;
      return next(e);
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await User.updateOne(
      { _id: user._id },
      {
        password: hash,
        $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
      }
    );

    return res.send({ ok: true, message: 'Пароль изменён. Теперь вы можете войти.' });
  } catch (err) {
    console.error('Password reset confirm failed:', err);
    const e = new Error('500 — Ошибка по умолчанию.');
    e.statusCode = 500;
    return next(e);
  }
};
