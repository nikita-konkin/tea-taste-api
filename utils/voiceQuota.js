const User = require('../models/user');

// Every second of audio sent for recognition is billed to whoever owns the
// SpeechKit account — not to the person who recorded it. Without a ceiling, one
// user with a four-hour file spends real money, and nothing about the content
// tells you that in advance. Thirty minutes a month is generous for tasting
// notes (the track itself is capped at five minutes) and cheap to be wrong about.
const MONTHLY_LIMIT_SECONDS = 30 * 60;

const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

const mmss = (seconds) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// Checks and books the time in one step, before anything is sent to SpeechKit —
// refusing after the request would mean paying for the answer anyway.
//
// Two jobs starting at the same instant could both pass this check: the read and
// the write are not atomic. Left as is deliberately — the overshoot is bounded by
// one track (five minutes), and the alternative is a findOneAndUpdate guard that
// makes the "not yet this month" reset much harder to express.
const reserve = async (owner, seconds) => {
  const wanted = Math.max(0, Math.round(Number(seconds) || 0));
  if (!wanted) return { ok: true, used: 0 };

  const user = await User.findById(owner).select('voiceSeconds voicePeriod');
  if (!user) return { ok: false, reason: 'Пользователь не найден.' };

  const period = currentPeriod();
  const used = user.voicePeriod === period ? (user.voiceSeconds || 0) : 0;

  if (used + wanted > MONTHLY_LIMIT_SECONDS) {
    const left = Math.max(0, MONTHLY_LIMIT_SECONDS - used);
    return {
      ok: false,
      reason: `Месячный лимит расшифровки исчерпан: осталось ${mmss(left)} из ${mmss(MONTHLY_LIMIT_SECONDS)}. Запись сохранена, её можно расшифровать в следующем месяце.`,
    };
  }

  await User.updateOne(
    { _id: owner },
    { voiceSeconds: used + wanted, voicePeriod: period },
  );
  return { ok: true, used: used + wanted, left: MONTHLY_LIMIT_SECONDS - used - wanted };
};

module.exports = { reserve, MONTHLY_LIMIT_SECONDS, currentPeriod };
