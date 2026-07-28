const request = require('supertest');
const app = require('../app');
const db = require('./db');
const User = require('../models/user');

const user = { name: 'Профиль', email: 'profile-test@example.com', password: 'Abc1!xyz' };

let cookie;
let otherCookie;

async function signIn(email, password) {
  const res = await request(app).post('/sign-in').send({ email, password });
  return res;
}

beforeAll(async () => {
  await db.connect();
  await db.clear();
  // Index builds are asynchronous, and the nickname collision test asserts on
  // the unique index specifically — without this it can race the first write.
  await User.init();
  await request(app).post('/sign-up').send(user);
  await request(app)
    .post('/sign-up')
    .send({ name: 'Другой', email: 'taken@example.com', password: 'Abc1!xyz' });
  cookie = (await signIn(user.email, user.password)).headers['set-cookie'];
  otherCookie = (await signIn('taken@example.com', 'Abc1!xyz')).headers['set-cookie'];
});

afterAll(async () => {
  await db.close();
});

describe('profile update', () => {
  test('PATCH /profile/me updates name, career, about and avatar', async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({
        name: 'Новое Имя',
        career: 'Чайный мастер',
        about: 'Люблю улуны и пуэры',
        avatar: 'https://example.com/avatar.png',
      });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Новое Имя');
    expect(res.body.data.career).toBe('Чайный мастер');
    expect(res.body.data.about).toBe('Люблю улуны и пуэры');
    expect(res.body.data.avatar).toBe('https://example.com/avatar.png');
  });

  test('GET /profile/me returns the saved fields', async () => {
    const res = await request(app).get('/profile/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.about).toBe('Люблю улуны и пуэры');
    expect(res.body.data.avatar).toBe('https://example.com/avatar.png');
  });

  test('empty string clears an optional field', async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({ about: '' });
    expect(res.status).toBe(200);
    expect(res.body.data.about).toBeUndefined();
  });

  test('POST /profile/avatar uploads a file and saves the path', async () => {
    // Tiny valid PNG header buffer is enough — only the mimetype is checked.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const res = await request(app)
      .post('/profile/avatar')
      .set('Cookie', cookie)
      .attach('avatar', png, { filename: 'me.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.data.avatar).toMatch(/^\/api\/uploads\/.+\.png$/);

    const profile = await request(app).get('/profile/me').set('Cookie', cookie);
    expect(profile.body.data.avatar).toBe(res.body.data.avatar);
  });

  test('POST /profile/avatar rejects non-image files -> 400', async () => {
    const res = await request(app)
      .post('/profile/avatar')
      .set('Cookie', cookie)
      .attach('avatar', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'text/x-sh' });
    expect(res.status).toBe(400);
  });

  test('invalid avatar URL -> 400', async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({ avatar: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  test('empty body -> 400', async () => {
    const res = await request(app).patch('/profile/me').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
  });

  test("changing email to another user's email -> 409", async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });

  test('PATCH /profile/me without auth -> 401', async () => {
    const res = await request(app).patch('/profile/me').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

describe('own voice quota on the profile', () => {
  test('GET /profile/me reports usage, remainder and both caps', async () => {
    const res = await request(app).get('/profile/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.voiceQuota.limitSeconds).toBe(30 * 60);
    expect(res.body.voiceQuota.maxTrackSeconds).toBe(300);
    expect(res.body.voiceQuota.usedSeconds).toBe(0);
    expect(res.body.voiceQuota.leftSeconds).toBe(30 * 60);
    expect(res.body.voiceQuota.period).toMatch(/^\d{4}-\d{2}$/);
  });

  test('spent time is subtracted from what is left', async () => {
    const period = new Date().toISOString().slice(0, 7);
    await User.updateOne({ email: user.email }, { voiceSeconds: 900, voicePeriod: period });

    const res = await request(app).get('/profile/me').set('Cookie', cookie);
    expect(res.body.voiceQuota.usedSeconds).toBe(900);
    expect(res.body.voiceQuota.leftSeconds).toBe(30 * 60 - 900);
  });

  test('a counter from an earlier month reads as a full allowance', async () => {
    await User.updateOne({ email: user.email }, { voiceSeconds: 1800, voicePeriod: '2000-01' });

    const res = await request(app).get('/profile/me').set('Cookie', cookie);
    // Telling a user "0:00 left" when the month has rolled over would send
    // them looking for a problem that expired with the calendar.
    expect(res.body.voiceQuota.usedSeconds).toBe(0);
    expect(res.body.voiceQuota.leftSeconds).toBe(30 * 60);
  });
});

describe('nickname', () => {
  test('PATCH /profile/me saves a nickname', async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({ nickname: 'Чайник' });
    expect(res.status).toBe(200);
    expect(res.body.data.nickname).toBe('Чайник');
  });

  test('a nickname another account already has -> 409', async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', otherCookie)
      .send({ nickname: 'Чайник' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/никнейм/i);
  });

  test('a one-character nickname -> 400', async () => {
    const res = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({ nickname: 'ы' });
    expect(res.status).toBe(400);
  });

  test('an empty nickname clears it, and frees it for someone else', async () => {
    const cleared = await request(app)
      .patch('/profile/me')
      .set('Cookie', cookie)
      .send({ nickname: '' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.nickname).toBeUndefined();

    // Unset rather than stored as '': two accounts with an empty nickname must
    // not collide on the unique index.
    const second = await request(app)
      .patch('/profile/me')
      .set('Cookie', otherCookie)
      .send({ nickname: '' });
    expect(second.status).toBe(200);

    const reused = await request(app)
      .patch('/profile/me')
      .set('Cookie', otherCookie)
      .send({ nickname: 'Чайник' });
    expect(reused.status).toBe(200);
  });
});

describe('password change', () => {
  const newPassword = 'New2@abc';

  test('wrong current password -> 401, password unchanged', async () => {
    const res = await request(app)
      .patch('/profile/password')
      .set('Cookie', cookie)
      .send({ oldPassword: 'Wrong1!xy', newPassword });
    expect(res.status).toBe(401);

    const login = await signIn(user.email, user.password);
    expect(login.status).toBe(200);
  });

  test('weak new password -> 400', async () => {
    const res = await request(app)
      .patch('/profile/password')
      .set('Cookie', cookie)
      .send({ oldPassword: user.password, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  test('valid change works; old password stops working, new one works', async () => {
    const res = await request(app)
      .patch('/profile/password')
      .set('Cookie', cookie)
      .send({ oldPassword: user.password, newPassword });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const oldLogin = await signIn(user.email, user.password);
    expect(oldLogin.status).toBe(401);

    const newLogin = await signIn(user.email, newPassword);
    expect(newLogin.status).toBe(200);
  });

  test('PATCH /profile/password without auth -> 401', async () => {
    const res = await request(app)
      .patch('/profile/password')
      .send({ oldPassword: 'Abc1!xyz', newPassword });
    expect(res.status).toBe(401);
  });
});
