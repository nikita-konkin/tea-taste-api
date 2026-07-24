const request = require('supertest');
const app = require('../app');
const db = require('./db');

const SID = '11111111-1111-4111-8111-111111111111';

const formBody = {
  nameRU: 'Да Хун Пао',
  country: 'Китай',
  shop: 'Чайный дом',
  type: 'Улун',
  weight: 8,
  water: 'Родниковая',
  volume: 150,
  temperature: 95,
  price: 25.5,
  teaware: 'Гайвань',
  brewingtype: 'Проливы',
  publicAccess: true,
  averageRating: 8.5,
};

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
  cookieA = await signUpAndIn('Хозяин', 'owner@example.com');
  cookieB = await signUpAndIn('Чужой', 'stranger@example.com');
});

afterAll(async () => {
  await db.close();
});

describe('tea form CRUD', () => {
  test('POST /create-form creates a form', async () => {
    const res = await request(app)
      .post(`/create-form/${SID}`)
      .set('Cookie', cookieA)
      .send(formBody);
    expect(res.status).toBe(200);
    expect(res.body.data.upsertedCount).toBe(1);
  });

  test('GET /my-form returns the form to its owner', async () => {
    const res = await request(app).get(`/my-form/${SID}`).set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].nameRU).toBe(formBody.nameRU);
  });

  test('PATCH /create-form persists changes (regression: patch was a no-op)', async () => {
    const res = await request(app)
      .patch(`/create-form/${SID}`)
      .set('Cookie', cookieA)
      .send({ ...formBody, shop: 'Другой магазин', averageRating: 9.5 });
    expect(res.status).toBe(200);

    const after = await request(app).get(`/my-form/${SID}`).set('Cookie', cookieA);
    expect(after.body.data[0].shop).toBe('Другой магазин');
    expect(after.body.data[0].averageRating).toBe(9.5);
  });

  test('POST /create-form with a non-UUID sessionId -> 400', async () => {
    const res = await request(app)
      .post('/create-form/not-a-uuid')
      .set('Cookie', cookieA)
      .send(formBody);
    expect(res.status).toBe(400);
  });

  test('POST /create-form with a missing required field -> 400', async () => {
    const { nameRU, ...incomplete } = formBody;
    const res = await request(app)
      .post(`/create-form/${SID}`)
      .set('Cookie', cookieA)
      .send(incomplete);
    expect(res.status).toBe(400);
  });
});

describe('access control', () => {
  test('GET /my-form of another user -> empty list', async () => {
    const res = await request(app).get(`/my-form/${SID}`).set('Cookie', cookieB);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  test('GET /public-forms works without auth and includes the public form', async () => {
    const res = await request(app).get('/public-forms');
    expect(res.status).toBe(200);
    expect(res.body.data.some((f) => f.sessionId === SID)).toBe(true);
  });

  test('GET /public-forms exposes the author name/avatar but not the email', async () => {
    await request(app)
      .patch('/profile/me')
      .set('Cookie', cookieA)
      .send({ avatar: 'https://example.com/owner.png' });

    const res = await request(app).get('/public-forms');
    const form = res.body.data.find((f) => f.sessionId === SID);
    expect(form.owner.name).toBe('Хозяин');
    expect(form.owner.avatar).toBe('https://example.com/owner.png');
    expect(form.owner.email).toBeUndefined();
  });

  test('GET /public-forms is paginated', async () => {
    const res = await request(app).get('/public-forms?page=1&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pages).toBeGreaterThanOrEqual(1);
  });

  test('GET /public-forms filters by tea type', async () => {
    const match = await request(app).get(`/public-forms?type=${encodeURIComponent('Улун')}`);
    expect(match.body.data.every((f) => f.type === 'Улун')).toBe(true);

    const none = await request(app).get(`/public-forms?type=${encodeURIComponent('Мате')}`);
    expect(none.body.data).toHaveLength(0);
    expect(none.body.total).toBe(0);
  });

  test('GET /public-form/:sessionId returns one public form with its author', async () => {
    const res = await request(app).get(`/public-form/${SID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sessionId).toBe(SID);
    expect(res.body.data.owner.name).toBe('Хозяин');
  });

  test('GET /public-form/:sessionId for a nonexistent session -> 404', async () => {
    const res = await request(app).get('/public-form/99999999-9999-4999-8999-999999999999');
    expect(res.status).toBe(404);
  });

  test('DELETE /my-form of another user -> 404, form survives', async () => {
    const res = await request(app).delete(`/my-form/${SID}`).set('Cookie', cookieB);
    expect(res.status).toBe(404);

    const still = await request(app).get(`/my-form/${SID}`).set('Cookie', cookieA);
    expect(still.body.data).toHaveLength(1);
  });

  test('DELETE /my-form by the owner works; repeat -> 404', async () => {
    const del = await request(app).delete(`/my-form/${SID}`).set('Cookie', cookieA);
    expect(del.status).toBe(200);

    const gone = await request(app).get(`/my-form/${SID}`).set('Cookie', cookieA);
    expect(gone.body.data).toHaveLength(0);

    const again = await request(app).delete(`/my-form/${SID}`).set('Cookie', cookieA);
    expect(again.status).toBe(404);
  });
});

describe('tea photos', () => {
  const PID = '22222222-2222-4222-8222-222222222222';
  const dry = { url: '/api/uploads/abc-1700000000dead.jpg', kind: 'dry' };
  const liquor = { url: '/api/uploads/abc-1700000001beef.png', kind: 'liquor' };

  const create = (body) =>
    request(app).post(`/create-form/${PID}`).set('Cookie', cookieA).send(body);
  const patch = (body) =>
    request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA).send(body);
  const read = async () =>
    (await request(app).get(`/my-form/${PID}`).set('Cookie', cookieA)).body.data[0];

  test('a form created without photos has an empty list', async () => {
    expect((await create(formBody)).status).toBe(200);
    expect((await read()).photos).toEqual([]);
  });

  test('PATCH stores photos and strips subdocument ids', async () => {
    expect((await patch({ ...formBody, photos: [dry, liquor] })).status).toBe(200);
    expect((await read()).photos).toEqual([dry, liquor]);
  });

  test('PATCH without photos leaves them untouched', async () => {
    expect((await patch(formBody)).status).toBe(200);
    expect((await read()).photos).toEqual([dry, liquor]);
  });

  test('a stored form round-trips through the edit dialog unchanged', async () => {
    // FormEdit sends back exactly what it read, so that shape must validate.
    const stored = await read();
    const res = await patch({ ...formBody, photos: stored.photos });
    expect(res.status).toBe(200);
  });

  test('PATCH with an empty array clears them', async () => {
    expect((await patch({ ...formBody, photos: [] })).status).toBe(200);
    expect((await read()).photos).toEqual([]);
  });

  test('the public feed exposes photos', async () => {
    await patch({ ...formBody, photos: [dry] });
    const res = await request(app).get(`/public-form/${PID}`);
    expect(res.body.data.photos).toEqual([dry]);
  });

  test.each([
    ['more than three photos', [dry, liquor, { ...dry, kind: 'wet' }, { url: dry.url, kind: 'dry' }]],
    ['a duplicated kind', [dry, { ...liquor, kind: 'dry' }]],
    ['an unknown kind', [{ url: dry.url, kind: 'bogus' }]],
    ['an off-site url', [{ url: 'https://evil.example.com/x.jpg', kind: 'dry' }]],
    ['a traversal url', [{ url: '/api/uploads/../../app.js', kind: 'dry' }]],
    ['null', null],
  ])('PATCH rejects %s -> 400', async (_label, photos) => {
    expect((await patch({ ...formBody, photos })).status).toBe(400);
  });

  test('DELETE removes the form regardless of its photos', async () => {
    expect((await request(app).delete(`/my-form/${PID}`).set('Cookie', cookieA)).status).toBe(200);
    expect((await request(app).get(`/my-form/${PID}`).set('Cookie', cookieA)).body.data).toHaveLength(0);
  });
});
