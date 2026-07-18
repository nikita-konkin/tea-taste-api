const request = require('supertest');
const app = require('../app');
const db = require('./db');

const SID = '22222222-2222-4222-8222-222222222222';

let cookieA;
let cookieB;

async function signUpAndIn(name, email) {
  await request(app).post('/sign-up').send({ name, email, password: 'Abc1!xyz' });
  const login = await request(app).post('/sign-in').send({ email, password: 'Abc1!xyz' });
  return login.headers['set-cookie'];
}

beforeAll(async () => {
  await db.connect();
  await db.clear();
  cookieA = await signUpAndIn('Хозяин', 'brew-owner@example.com');
  cookieB = await signUpAndIn('Чужой', 'brew-stranger@example.com');
});

afterAll(async () => {
  await db.close();
});

describe('health', () => {
  test('GET /health -> ok with db connected', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'connected' });
  });
});

describe('brewings', () => {
  test('POST creates a brewing', async () => {
    const res = await request(app)
      .post(`/my-brewings/${SID}/brew/1`)
      .set('Cookie', cookieA)
      .send({
        description: 'Первый пролив, сладкий',
        brewingRating: 8,
        brewingTime: '00:00:15',
        publicAccess: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.brew.upsertedCount).toBe(1);
  });

  test('PATCH by the owner updates the brewing', async () => {
    const res = await request(app)
      .patch(`/my-brewings/${SID}/brew/1`)
      .set('Cookie', cookieA)
      .send({ description: 'Обновлённое описание', brewingRating: 9, publicAccess: true });
    expect(res.status).toBe(200);
    expect(res.body.data.brewingRating).toBe(9);
  });

  test('PATCH by another user modifies nothing (owner scoping)', async () => {
    const res = await request(app)
      .patch(`/my-brewings/${SID}/brew/1`)
      .set('Cookie', cookieB)
      .send({ description: 'Взломанное описание', brewingRating: 1, publicAccess: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();

    const mine = await request(app).get(`/my-brewings/${SID}`).set('Cookie', cookieA);
    expect(mine.body.data[0].brewingRating).toBe(9);
  });

  test('GET /public-brewings without auth returns public brewings', async () => {
    const res = await request(app).get(`/public-brewings/${SID}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('DELETE /my-brews by another user -> 404', async () => {
    const res = await request(app).delete(`/my-brews/${SID}`).set('Cookie', cookieB);
    expect(res.status).toBe(404);
  });

  test('DELETE /my-brews by the owner removes the brewings', async () => {
    const res = await request(app).delete(`/my-brews/${SID}`).set('Cookie', cookieA);
    expect(res.status).toBe(200);

    const gone = await request(app).get(`/my-brewings/${SID}`).set('Cookie', cookieA);
    expect(gone.body.data).toHaveLength(0);
  });
});
