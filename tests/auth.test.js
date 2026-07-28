const request = require('supertest');
const app = require('../app');
const db = require('./db');
const Setting = require('../models/setting');

const user = { name: 'Тестер', email: 'auth-test@example.com', password: 'Abc1!xyz' };

beforeAll(async () => {
  await db.connect();
  await db.clear();
});

afterAll(async () => {
  await db.close();
});

describe('registration and login', () => {
  test('POST /sign-up creates a user', async () => {
    const res = await request(app).post('/sign-up').send(user);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
  });

  test('POST /sign-up with the same email again -> 409', async () => {
    const res = await request(app).post('/sign-up').send(user);
    expect(res.status).toBe(409);
  });

  test('POST /sign-up with a weak password -> 400', async () => {
    const res = await request(app)
      .post('/sign-up')
      .send({ name: 'X', email: 'weak@example.com', password: 'weak' });
    expect(res.status).toBe(400);
  });

  test('POST /sign-in with a wrong password -> 401', async () => {
    const res = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: 'Wrong1!xy' });
    expect(res.status).toBe(401);
  });

  test('POST /sign-in with valid credentials sets the jwt cookie', async () => {
    const res = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].join(';')).toMatch(/jwt=/);
  });
});

describe('the registration kill switch', () => {
  afterEach(async () => {
    await Setting.deleteMany({});
  });

  test('GET /settings reports registration open by default', async () => {
    const res = await request(app).get('/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.registrationOpen).toBe(true);
  });

  test('with registration closed, POST /sign-up -> 403 and no user is created', async () => {
    await Setting.create({ key: 'app', registrationOpen: false });

    const res = await request(app)
      .post('/sign-up')
      .send({ name: 'Незваный', email: 'closed@example.com', password: 'Abc1!xyz' });
    expect(res.status).toBe(403);

    // The door being shut must actually stop the write, not just the response.
    const login = await request(app)
      .post('/sign-in')
      .send({ email: 'closed@example.com', password: 'Abc1!xyz' });
    expect(login.status).toBe(401);
  });

  test('closing registration does not lock out existing accounts', async () => {
    await Setting.create({ key: 'app', registrationOpen: false });

    const res = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
  });

  test('GET /settings reflects the closed state, without auth', async () => {
    await Setting.create({ key: 'app', registrationOpen: false });

    const res = await request(app).get('/settings');
    expect(res.status).toBe(200);
    expect(res.body.data.registrationOpen).toBe(false);
  });

  test('reopening lets sign-up through again', async () => {
    await Setting.create({ key: 'app', registrationOpen: false });
    await Setting.updateOne({ key: 'app' }, { registrationOpen: true });

    const res = await request(app)
      .post('/sign-up')
      .send({ name: 'Снова', email: 'reopened@example.com', password: 'Abc1!xyz' });
    expect(res.status).toBe(200);
  });
});

describe('auth middleware', () => {
  test('GET /profile/me without a cookie -> single 401 JSON response', async () => {
    const res = await request(app).get('/profile/me');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('GET /profile/me with a garbage token -> 401, no crash', async () => {
    const res = await request(app)
      .get('/profile/me')
      .set('Cookie', 'jwt=not-a-real-token');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('GET /profile/me with a valid cookie -> the user profile', async () => {
    const login = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: user.password });
    const res = await request(app)
      .get('/profile/me')
      .set('Cookie', login.headers['set-cookie']);
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
  });
});

describe('unknown route', () => {
  test('GET /no-such-route without auth -> 401 (auth middleware runs first)', async () => {
    const res = await request(app).get('/no-such-route');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('GET /no-such-route with auth -> JSON 404', async () => {
    const login = await request(app)
      .post('/sign-in')
      .send({ email: user.email, password: user.password });
    const res = await request(app)
      .get('/no-such-route')
      .set('Cookie', login.headers['set-cookie']);
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });
});
