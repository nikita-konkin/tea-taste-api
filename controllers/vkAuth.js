const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const {
  newPkce, authorizeUrl, exchangeCode, fetchUserInfo,
} = require('../utils/vkid');
const { isRegistrationOpen } = require('../utils/settings');
const { t } = require('../utils/apiMessages');
const { LOCALES, DEFAULT_LOCALE, localizePath } = require('../utils/locale');

const STATE_COOKIE_MS = 10 * 60 * 1000;

// Same fallbacks as passwordReset.js: the real site in production, the
// sandbox proxy otherwise.
const frontendBase = () => process.env.FRONTEND_URL
  || (process.env.NODE_ENV === 'production' ? 'https://teaform.ru' : 'http://localhost:8088');

// The redirect URI registered in the VK app cabinet. Behind the outer nginx
// the /api prefix is stripped, so the backend route is /auth/vk/callback.
const redirectUri = () => process.env.VK_REDIRECT_URI || `${frontendBase()}/api/auth/vk/callback`;

const stateCookieOpts = () => ({
  maxAge: STATE_COOKIE_MS,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // must survive the top-level redirect back from id.vk.com
});

// Which language the user was reading when they left for VK.
//
// This is a top-level browser redirect, not a fetch, so there is no X-Locale
// header to read and req.locale would fall back to whatever the browser's
// Accept-Language happens to say — which is exactly the guess the URL prefix
// exists to override. So the app passes ?locale= on the way out and we park it
// next to the PKCE material, which already has to survive the round trip.
//
// Untrusted like any query parameter: an exact match against the known locales
// or nothing.
const localeFromQuery = (req) => {
  const asked = String(req.query.locale || '').trim().toLowerCase();
  return LOCALES.includes(asked) ? asked : DEFAULT_LOCALE;
};

// GET /auth/vk — send the user to VK ID with fresh PKCE material.
module.exports.startVkAuth = (req, res, next) => {
  if (!process.env.VK_CLIENT_ID) {
    return next({ message: t(req, 'api.vkNotConfigured'), statusCode: 503 });
  }

  const { verifier, challenge, state } = newPkce();
  res.cookie('vk_state', state, stateCookieOpts());
  res.cookie('vk_pkce', verifier, stateCookieOpts());
  res.cookie('vk_locale', localeFromQuery(req), stateCookieOpts());

  return res.redirect(authorizeUrl({
    clientId: process.env.VK_CLIENT_ID,
    redirectUri: redirectUri(),
    state,
    challenge,
  }));
};

// GET /auth/vk/callback — verify state, trade the code for a profile and
// sign the user in (creating or linking the account as needed).
module.exports.vkCallback = async (req, res) => {
  const { NODE_ENV, JWT_SECRET } = process.env;
  const { code, state, device_id: deviceId } = req.query;
  const savedState = req.cookies.vk_state;
  const verifier = req.cookies.vk_pkce;
  const locale = LOCALES.includes(req.cookies.vk_locale) ? req.cookies.vk_locale : DEFAULT_LOCALE;
  res.clearCookie('vk_state');
  res.clearCookie('vk_pkce');
  res.clearCookie('vk_locale');

  // Every exit from here goes back to the language the user left in — landing
  // an English reader on a Russian error page is a worse failure than the one
  // being reported.
  const back = (path) => `${frontendBase()}${localizePath(path, locale)}`;

  const fail = (reason) => {
    console.error('VK auth failed:', reason);
    return res.redirect(`${back('/sign-in')}?vk_error=1`);
  };

  if (!code || !state || !savedState || !verifier || state !== savedState) {
    return fail('missing or mismatched state/code');
  }

  try {
    const tokens = await exchangeCode({
      clientId: process.env.VK_CLIENT_ID,
      clientSecret: process.env.VK_CLIENT_SECRET,
      code,
      deviceId,
      verifier,
      redirectUri: redirectUri(),
      state,
    });
    const info = await fetchUserInfo({
      clientId: process.env.VK_CLIENT_ID,
      accessToken: tokens.access_token,
    });

    const vkId = String(info.user_id);
    const email = info.email || '';
    const name = (`${info.first_name || ''} ${info.last_name || ''}`.trim() || `VK ${vkId}`).slice(0, 30);

    let user = await User.findOne({ vkId });
    if (!user && email) {
      // Same email already registered: link the VK identity to it.
      user = await User.findOneAndUpdate({ email }, { vkId }, { new: true });
    }
    if (!user) {
      // Closing registration has to close this door too, or the switch only
      // stops the half of sign-ups that go through the form. Accounts that
      // already exist — matched by vkId or linked by email above — still get in.
      if (!await isRegistrationOpen()) {
        return res.redirect(`${back('/sign-in')}?vk_error=closed`);
      }

      // VK-only account: satisfy the required password with a random one
      // (the user can always set a real one via password reset).
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await User.create({
        name,
        email: email || `vk${vkId}@vkid.local`,
        password: randomPassword,
        vkId,
        language: locale,
        ...(info.avatar ? { avatar: info.avatar } : {}),
      });
    }

    const token = jwt.sign(
      { _id: user._id },
      NODE_ENV === 'production' ? JWT_SECRET : 'dev-secret'
    );
    res.cookie('jwt', token, {
      maxAge: 180 * 24 * 60 * 60 * 1000,
      httpOnly: NODE_ENV == 'production' ? true : false,
      secure: NODE_ENV === 'production',
      domain: NODE_ENV == 'production' ? '.teaform.ru' : '',
    });

    // An existing account's own stored preference wins over the page they
    // happened to click the button on; a brand-new one has just been given
    // that page's language, so the two agree.
    return res.redirect(`${frontendBase()}${localizePath('/oauth/vk', user.language || locale)}`);
  } catch (err) {
    return fail(err.message);
  }
};
