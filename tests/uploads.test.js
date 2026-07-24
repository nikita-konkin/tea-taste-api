const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../app');
const db = require('./db');
const { uploadDir } = require('../middlewares/upload');

// Tiny valid PNG header — only the declared mimetype is inspected.
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let cookieA;
let cookieB;
let userIdA;

// Everything this suite writes to uploads/, so nothing is left behind.
const created = [];

const uploadPhoto = (cookie, attach = (r) => r.attach('photo', png(), { filename: 'leaf.png', contentType: 'image/png' })) =>
  attach(request(app).post('/upload/tea-photo').set('Cookie', cookie));

async function signUpAndIn(name, email) {
  await request(app).post('/sign-up').send({ name, email, password: 'Abc1!xyz' });
  const login = await request(app).post('/sign-in').send({ email, password: 'Abc1!xyz' });
  return login.headers['set-cookie'];
}

beforeAll(async () => {
  await db.connect();
  await db.clear();
  cookieA = await signUpAndIn('Фотограф', 'photos-owner@example.com');
  cookieB = await signUpAndIn('Чужой', 'photos-stranger@example.com');
  const me = await request(app).get('/profile/me').set('Cookie', cookieA);
  userIdA = String(me.body.data._id);
});

afterAll(async () => {
  await Promise.all(created.map((f) => fs.promises.unlink(path.join(uploadDir, f)).catch(() => {})));
  await db.close();
});

describe('POST /upload/tea-photo', () => {
  test('stores an image and returns its public url', async () => {
    const res = await uploadPhoto(cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^\/api\/uploads\/.+\.png$/);

    const filename = path.basename(res.body.data.url);
    created.push(filename);
    expect(filename.startsWith(`${userIdA}-`)).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(true);
  });

  test('names the file from the mimetype, not from originalname', async () => {
    // An html originalname must not produce an .html file: express.static
    // would serve it as text/html from the API's own origin.
    const res = await uploadPhoto(cookieA, (r) =>
      r.attach('photo', png(), { filename: 'x.html', contentType: 'image/png' }));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/\.png$/);
    created.push(path.basename(res.body.data.url));
  });

  test('rejects a non-image -> 400', async () => {
    const res = await uploadPhoto(cookieA, (r) =>
      r.attach('photo', Buffer.from('#!/bin/sh'), { filename: 'x.sh', contentType: 'text/x-sh' }));
    expect(res.status).toBe(400);
  });

  test('rejects a file over the size limit -> 400', async () => {
    const res = await uploadPhoto(cookieA, (r) =>
      r.attach('photo', Buffer.alloc(9 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' }));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 МБ/);
  });

  test('rejects a request without a file -> 400', async () => {
    const res = await request(app).post('/upload/tea-photo').set('Cookie', cookieA);
    expect(res.status).toBe(400);
  });

  test('requires authentication -> 401', async () => {
    const res = await request(app)
      .post('/upload/tea-photo')
      .attach('photo', png(), { filename: 'leaf.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /upload/tea-photo/:filename', () => {
  test('removes an own file, and is idempotent', async () => {
    const uploaded = await uploadPhoto(cookieA);
    const filename = path.basename(uploaded.body.data.url);

    const first = await request(app).delete(`/upload/tea-photo/${filename}`).set('Cookie', cookieA);
    expect(first.status).toBe(204);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(false);

    const second = await request(app).delete(`/upload/tea-photo/${filename}`).set('Cookie', cookieA);
    expect(second.status).toBe(204);
  });

  test("refuses another user's file -> 403", async () => {
    const uploaded = await uploadPhoto(cookieA);
    const filename = path.basename(uploaded.body.data.url);
    created.push(filename);

    const res = await request(app).delete(`/upload/tea-photo/${filename}`).set('Cookie', cookieB);
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(true);
  });

  test('refuses a traversal path and leaves the file alone -> 403', async () => {
    const res = await request(app)
      .delete('/upload/tea-photo/..%2F..%2Fapp.js')
      .set('Cookie', cookieA);
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(__dirname, '..', 'app.js'))).toBe(true);
  });

  test('requires authentication -> 401', async () => {
    const res = await request(app).delete(`/upload/tea-photo/${userIdA}-1.png`);
    expect(res.status).toBe(401);
  });
});
