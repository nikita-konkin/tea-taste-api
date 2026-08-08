const request = require('supertest');
const app = require('../app');
const db = require('./db');
const User = require('../models/user');

// The saved reading language.
//
// The rule the whole feature rests on: an explicit URL always wins, and the
// preference only decides where signing in lands you. Nothing else consults it,
// which is what keeps a shared link opening in the language its address names
// no matter who follows it.

const password = 'Abc1!xyz';
const signUp = (email, locale) => {
  const req = request(app).post('/sign-up');
  if (locale) req.set('X-Locale', locale);
  return req.send({ name: 'Читатель', email, password });
};
const signIn = (email) => request(app).post('/sign-in').send({ email, password });
const cookieFor = async (email) => (await signIn(email)).headers['set-cookie'];

beforeAll(async () => {
  await db.connect();
  await db.clear();
});

afterAll(async () => { await db.close(); });

describe('signing up records the language the form was read in', () => {
  test('a sign-up under /en is an English account', async () => {
    await signUp('lang-en@example.com', 'en');
    const user = await User.findOne({ email: 'lang-en@example.com' });
    expect(user.language).toBe('en');
  });

  test('a sign-up with no locale header is Russian, as the bare paths are', async () => {
    await signUp('lang-bare@example.com');
    const user = await User.findOne({ email: 'lang-bare@example.com' });
    expect(user.language).toBe('ru');
  });

  test('sign-in reports the language back so the app can land in it', async () => {
    const res = await signIn('lang-en@example.com');
    expect(res.status).toBe(200);
    expect(res.body.language).toBe('en');
  });
});

describe('changing the saved language', () => {
  const email = 'lang-change@example.com';

  beforeAll(async () => { await signUp(email, 'ru'); });

  test('PATCH stores it and the profile reads it back', async () => {
    const cookie = await cookieFor(email);
    const patched = await request(app).patch('/profile/me').set('Cookie', cookie).send({ language: 'zh' });
    expect(patched.status).toBe(200);

    const profile = await request(app).get('/profile/me').set('Cookie', cookie);
    expect(profile.body.data.language).toBe('zh');
    expect((await signIn(email)).body.language).toBe('zh');
  });

  test('an empty string clears it back to never-said', async () => {
    const cookie = await cookieFor(email);
    await request(app).patch('/profile/me').set('Cookie', cookie).send({ language: '' });

    const user = await User.findOne({ email });
    expect(user.language).toBeUndefined();
    // '' rather than a guessed default: the app reads it as "leave them where
    // they already are", which is what an account with no preference wants.
    expect((await signIn(email)).body.language).toBe('');
  });

  test('a language we do not serve is refused, not stored', async () => {
    const cookie = await cookieFor(email);
    const res = await request(app).patch('/profile/me').set('Cookie', cookie).send({ language: 'de' });
    expect(res.status).toBe(400);
    expect((await User.findOne({ email })).language).toBeUndefined();
  });

  test('the language cannot be set on someone else by an unauthenticated call', async () => {
    const res = await request(app).patch('/profile/me').send({ language: 'en' });
    expect(res.status).toBe(401);
  });
});

describe('accounts that predate the setting', () => {
  test('sign-in reports no language, and nothing is invented for them', async () => {
    const email = 'lang-legacy@example.com';
    await signUp(email, 'ru');
    // Exactly the shape of every account created before this field existed.
    await User.updateOne({ email }, { $unset: { language: 1 } });

    const res = await signIn(email);
    expect(res.body.language).toBe('');
    expect((await User.findOne({ email })).language).toBeUndefined();
  });
});
