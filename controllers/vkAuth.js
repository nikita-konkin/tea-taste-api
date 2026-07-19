const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const {
  newPkce, authorizeUrl, exchangeCode, fetchUserInfo,
} = require('../utils/vkid');

const STATE_COOKIE_MS = 10 * 60 * 1000;

const frontendBase = () => process.env.FRONTEND_URL || 'http://localhost:8088';

// The redirect URI registered in the VK app cabinet. Behind the outer nginx
// the /api prefix is stripped, so the backend route is /auth/vk/callback.
const redirectUri = () => process.env.VK_REDIRECT_URI || `${frontendBase()}/api/auth/vk/callback`;

const stateCookieOpts = () => ({
  maxAge: STATE_COOKIE_MS,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax', // must survive the top-level redirect back from id.vk.com
});

// GET /auth/vk — send the user to VK ID with fresh PKCE material.
module.exports.startVkAuth = (req, res, next) => {
  if (!process.env.VK_CLIENT_ID) {
    return next({ message: 'Вход через VK не настроен.', statusCode: 503 });
  }

  const { verifier, challenge, state } = newPkce();
  res.cookie('vk_state', state, stateCookieOpts());
  res.cookie('vk_pkce', verifier, stateCookieOpts());

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
  res.clearCookie('vk_state');
  res.clearCookie('vk_pkce');

  const fail = (reason) => {
    console.error('VK auth failed:', reason);
    return res.redirect(`${frontendBase()}/sign-in?vk_error=1`);
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
      // VK-only account: satisfy the required password with a random one
      // (the user can always set a real one via password reset).
      const randomPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      user = await User.create({
        name,
        email: email || `vk${vkId}@vkid.local`,
        password: randomPassword,
        vkId,
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

    return res.redirect(`${frontendBase()}/oauth/vk`);
  } catch (err) {
    return fail(err.message);
  }
};
