const request = require('supertest');
const app = require('../app');
const db = require('./db');

const user = { name: 'Профиль', email: 'profile-test@example.com', password: 'Abc1!xyz' };

let cookie;

async function signIn(email, password) {
  const res = await request(app).post('/sign-in').send({ email, password });
  return res;
}

beforeAll(async () => {
  await db.connect();
  await db.clear();
  await request(app).post('/sign-up').send(user);
  await request(app)
    .post('/sign-up')
    .send({ name: 'Другой', email: 'taken@example.com', password: 'Abc1!xyz' });
  cookie = (await signIn(user.email, user.password)).headers['set-cookie'];
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
