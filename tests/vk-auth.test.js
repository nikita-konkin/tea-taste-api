/* VK ID OAuth flow: redirect construction, state validation, and the
   callback's find-or-create logic (VK endpoints stubbed via global.fetch). */
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/user');

const mdbAddr = process.env.API_MONGO_URI || 'mongodb://localhost:27017/tea-taste-test';

beforeAll(async () => {
  await mongoose.connect(mdbAddr);
  await User.deleteMany({});
});

afterAll(async () => {
  await User.deleteMany({});
  await mongoose.connection.close();
});

afterEach(() => {
  delete process.env.VK_CLIENT_ID;
  if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
});

const vkFetchMock = (userInfo) => jest.fn()
  .mockResolvedValueOnce({
    ok: true,
    json: async () => ({ access_token: 'vk-access', user_id: userInfo.user_id }),
  })
  .mockResolvedValueOnce({
    ok: true,
    json: async () => ({ user: userInfo }),
  });

// Walks /auth/vk to get valid state/pkce cookies, then hits the callback.
// `locale` is what the app appends when the user was reading /en or /zh — this
// is a top-level browser redirect, so there is no X-Locale header to carry it.
const runCallback = async (agentApp, userInfo, locale) => {
  process.env.VK_CLIENT_ID = '12345';
  const start = await request(agentApp).get(`/auth/vk${locale ? `?locale=${locale}` : ''}`);
  const cookies = start.headers['set-cookie'];
  const state = cookies.find((c) => c.startsWith('vk_state=')).split(';')[0].split('=')[1];

  global.fetch = vkFetchMock(userInfo);
  return request(agentApp)
    .get(`/auth/vk/callback?code=abc&state=${state}&device_id=dev1`)
    .set('Cookie', cookies.map((c) => c.split(';')[0]).join('; '));
};

describe('GET /auth/vk', () => {
  test('503 when VK_CLIENT_ID is not configured', async () => {
    const res = await request(app).get('/auth/vk');
    expect(res.status).toBe(503);
  });

  test('redirects to id.vk.com with PKCE and sets state cookies', async () => {
    process.env.VK_CLIENT_ID = '12345';
    const res = await request(app).get('/auth/vk');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://id.vk.com/authorize');
    expect(res.headers.location).toContain('client_id=12345');
    expect(res.headers.location).toContain('code_challenge_method=S256');
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toContain('vk_state=');
    expect(cookies).toContain('vk_pkce=');
  });
});

describe('GET /auth/vk/callback', () => {
  test('rejects a mismatched state', async () => {
    process.env.VK_CLIENT_ID = '12345';
    const start = await request(app).get('/auth/vk');
    const cookies = start.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
    const res = await request(app)
      .get('/auth/vk/callback?code=abc&state=WRONG&device_id=dev1')
      .set('Cookie', cookies);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('vk_error=1');
  });

  test('creates a user, sets the jwt cookie and redirects to /oauth/vk', async () => {
    const res = await runCallback(app, {
      user_id: 777, first_name: 'Ника', last_name: 'Чайная', email: 'vk-user@example.com',
    });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/oauth/vk');
    expect(res.headers['set-cookie'].join(';')).toContain('jwt=');

    const user = await User.findOne({ vkId: '777' });
    expect(user).not.toBeNull();
    expect(user.email).toBe('vk-user@example.com');
    expect(user.name).toBe('Ника Чайная');
  });

  test('a second login with the same vkId does not duplicate the user', async () => {
    await runCallback(app, {
      user_id: 777, first_name: 'Ника', last_name: 'Чайная', email: 'vk-user@example.com',
    });
    expect(await User.countDocuments({ vkId: '777' })).toBe(1);
  });

  test('links vkId to an existing account with the same email', async () => {
    await request(app).post('/sign-up').send({
      name: 'Existing', email: 'linkme@example.com', password: 'Passw0rd!',
    });
    await runCallback(app, {
      user_id: 888, first_name: 'Link', last_name: 'Test', email: 'linkme@example.com',
    });
    const user = await User.findOne({ email: 'linkme@example.com' });
    expect(user.vkId).toBe('888');
    expect(user.name).toBe('Existing'); // linking must not overwrite the profile
  });

  test('creates a placeholder email when VK does not share one', async () => {
    await runCallback(app, { user_id: 999, first_name: 'Без', last_name: 'Почты' });
    const user = await User.findOne({ vkId: '999' });
    expect(user.email).toBe('vk999@vkid.local');
  });
});

// Without this the round trip through id.vk.com is where an English reader
// loses their language: they leave from /en/sign-in and come back to a Russian
// site, having been given a Russian account on the way.
describe('the language survives the VK round trip', () => {
  test('a new account keeps the language it signed up in, and lands there', async () => {
    const res = await runCallback(app, { user_id: 555, first_name: 'New', last_name: 'Reader' }, 'en');
    expect(res.headers.location).toContain('/en/oauth/vk');
    expect((await User.findOne({ vkId: '555' })).language).toBe('en');
  });

  test('an existing account is returned to its own saved language, not the page it clicked from', async () => {
    await runCallback(app, { user_id: 556, first_name: 'Zh', last_name: 'Reader' }, 'zh');
    const res = await runCallback(app, { user_id: 556, first_name: 'Zh', last_name: 'Reader' }, 'en');
    expect(res.headers.location).toContain('/zh/oauth/vk');
  });

  test('Russian keeps the bare path', async () => {
    const res = await runCallback(app, { user_id: 557, first_name: 'Ru', last_name: 'Reader' }, 'ru');
    expect(res.headers.location).toMatch(/\/oauth\/vk$/);
    expect(res.headers.location).not.toContain('/ru/');
  });

  test('a bogus locale is ignored rather than reflected into the redirect', async () => {
    const res = await runCallback(app, { user_id: 558, first_name: 'X', last_name: 'Y' }, '../evil');
    expect(res.headers.location).toMatch(/\/oauth\/vk$/);
    expect((await User.findOne({ vkId: '558' })).language).toBe('ru');
  });

  test('a failure sends the reader back to sign-in in their own language', async () => {
    process.env.VK_CLIENT_ID = '12345';
    const start = await request(app).get('/auth/vk?locale=zh');
    const cookies = start.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
    const res = await request(app)
      .get('/auth/vk/callback?code=abc&state=wrong-state')
      .set('Cookie', cookies);
    expect(res.headers.location).toContain('/zh/sign-in');
  });
});
