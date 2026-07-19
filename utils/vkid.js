// VK ID (id.vk.com) OAuth 2.1 helpers: PKCE material, the authorize URL,
// code exchange and user-info fetch. The legacy oauth.vk.com flow is not
// available to new apps, so this is the only supported scheme.
const crypto = require('crypto');

const b64url = (buf) => buf.toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

module.exports.newPkce = () => {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = crypto.randomBytes(16).toString('hex');
  return { verifier, challenge, state };
};

module.exports.authorizeUrl = ({ clientId, redirectUri, state, challenge }) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'email',
  });
  return `https://id.vk.com/authorize?${params.toString()}`;
};

module.exports.exchangeCode = async ({
  clientId, clientSecret, code, deviceId, verifier, redirectUri, state,
}) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: clientId,
    device_id: deviceId,
    redirect_uri: redirectUri,
    state,
  });
  if (clientSecret) body.set('client_secret', clientSecret);

  const res = await fetch('https://id.vk.com/oauth2/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`VK token exchange failed: ${data.error_description || data.error || res.status}`);
  }
  return data;
};

module.exports.fetchUserInfo = async ({ clientId, accessToken }) => {
  const body = new URLSearchParams({ client_id: clientId, access_token: accessToken });
  const res = await fetch('https://id.vk.com/oauth2/user_info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.user) {
    throw new Error(`VK user_info failed: ${data.error_description || data.error || res.status}`);
  }
  return data.user; // { user_id, first_name, last_name, avatar, email, ... }
};
