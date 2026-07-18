const request = require('supertest');
const app = require('../app');
const db = require('./db');

const SID = '33333333-3333-4333-8333-333333333333';

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
  cookieA = await signUpAndIn('Хозяин', 'aroma-owner@example.com');
  cookieB = await signUpAndIn('Чужой', 'aroma-stranger@example.com');
});

afterAll(async () => {
  await db.close();
});

describe('aroma descriptors', () => {
  test('POST creates an aroma record', async () => {
    const res = await request(app)
      .post(`/my-aromas/${SID}/brew/1/aroma/1`)
      .set('Cookie', cookieA)
      .send({ aromaStage1: 'Цветочный', aromaStage2: 'Жасмин', publicAccess: true });
    expect(res.status).toBe(200);
  });

  test('PATCH updates selected stages and keeps the rest', async () => {
    const res = await request(app)
      .patch(`/my-aromas/${SID}/brew/1/aroma/1`)
      .set('Cookie', cookieA)
      .send({ aromaStage2: 'Роза', aromaStage3: 'Сухая роза' });
    expect(res.status).toBe(200);
    expect(res.body.data.aromaStage1).toBe('Цветочный');
    expect(res.body.data.aromaStage2).toBe('Роза');
    expect(res.body.data.aromaStage3).toBe('Сухая роза');
  });

  test('PATCH by another user modifies nothing (owner scoping)', async () => {
    const res = await request(app)
      .patch(`/my-aromas/${SID}/brew/1/aroma/1`)
      .set('Cookie', cookieB)
      .send({ aromaStage1: 'Взломанный' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();

    const mine = await request(app).get(`/my-aromas/${SID}`).set('Cookie', cookieA);
    expect(mine.body.data[0].aromaStage1).toBe('Цветочный');
  });

  test('GET /my-aromas returns the records to the owner', async () => {
    const res = await request(app).get(`/my-aromas/${SID}`).set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('taste descriptors', () => {
  test('POST creates a taste record', async () => {
    const res = await request(app)
      .post(`/my-tastes/${SID}/brew/1/taste/1`)
      .set('Cookie', cookieA)
      .send({ tasteStage1: 'Сладкий', publicAccess: true });
    expect(res.status).toBe(200);
  });

  test('PATCH updates stages', async () => {
    const res = await request(app)
      .patch(`/my-tastes/${SID}/brew/1/taste/1`)
      .set('Cookie', cookieA)
      .send({ tasteStage1: 'Медовый', tasteStage2: 'Липовый мёд' });
    expect(res.status).toBe(200);
    expect(res.body.data.tasteStage1).toBe('Медовый');
    expect(res.body.data.tasteStage2).toBe('Липовый мёд');
  });

  test('PATCH by another user modifies nothing', async () => {
    const res = await request(app)
      .patch(`/my-tastes/${SID}/brew/1/taste/1`)
      .set('Cookie', cookieB)
      .send({ tasteStage1: 'Взломанный' });
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  test('selective DELETE removes one record', async () => {
    const res = await request(app)
      .delete(`/my-tastes/${SID}/brew/1/taste/1`)
      .set('Cookie', cookieA);
    expect(res.status).toBe(200);

    const after = await request(app).get(`/my-tastes/${SID}`).set('Cookie', cookieA);
    expect(after.body.data).toHaveLength(0);
  });
});
