const request = require('supertest');
const app = require('../app');
const db = require('./db');

const user = { name: 'Забывчивый', email: 'forgot@example.com', password: 'Abc1!xyz' };
const newPassword = 'Rst3#qwe';

beforeAll(async () => {
  await db.connect();
  await db.clear();
  await request(app).post('/sign-up').send(user);
});

afterAll(async () => {
  await db.close();
});

describe('password reset', () => {
  let token;

  test('request for an unknown email still answers 200 (no enumeration)', async () => {
    const res = await request(app)
      .post('/password-reset/request')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('request for a known email returns a token outside production', async () => {
    const res = await request(app)
      .post('/password-reset/request')
      .send({ email: user.email });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toMatch(/^[0-9a-f]{64}$/);
    token = res.body.resetToken;
  });

  test('confirm with a bogus token -> 400', async () => {
    const res = await request(app)
      .post('/password-reset/confirm')
      .send({ token: 'a'.repeat(64), newPassword });
    expect(res.status).toBe(400);
  });

  test('confirm with a weak password -> 400', async () => {
    const res = await request(app)
      .post('/password-reset/confirm')
      .send({ token, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  test('confirm works; old password stops working, new one logs in', async () => {
    const res = await request(app)
      .post('/password-reset/confirm')
      .send({ token, newPassword });
    expect(res.status).toBe(200);

    const oldLogin = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(200);
  });

  test('a used token cannot be reused', async () => {
    const res = await request(app)
      .post('/password-reset/confirm')
      .send({ token, newPassword: 'Zxc4$vbn' });
    expect(res.status).toBe(400);
  });
});
