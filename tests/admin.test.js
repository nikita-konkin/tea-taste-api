/* Admin endpoints: role gating, user listing, role changes, and cascading
   account deletion. */
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/user');
const Teaform = require('../models/teaform');

const mdbAddr = process.env.API_MONGO_URI || 'mongodb://localhost:27017/tea-taste-test';

const signUpAndIn = async (name, email) => {
  await request(app).post('/sign-up').send({ name, email, password: 'Passw0rd!' });
  const res = await request(app).post('/sign-in').send({ email, password: 'Passw0rd!' });
  return res.headers['set-cookie'];
};

let adminCookie;
let userCookie;
let plainUser;

beforeAll(async () => {
  await mongoose.connect(mdbAddr);
  await User.deleteMany({});
  await Teaform.deleteMany({});

  adminCookie = await signUpAndIn('Admin', 'admin@example.com');
  userCookie = await signUpAndIn('Plain', 'plain@example.com');
  await User.updateOne({ email: 'admin@example.com' }, { role: 'admin' });
  plainUser = await User.findOne({ email: 'plain@example.com' });
});

afterAll(async () => {
  await User.deleteMany({});
  await Teaform.deleteMany({});
  await mongoose.connection.close();
});

describe('role gating', () => {
  test('a regular user gets 403', async () => {
    const res = await request(app).get('/admin/users').set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('GET /admin/users', () => {
  test('lists users with roles and form counts', async () => {
    const sessionId = '22222222-2222-4222-8222-222222222222';
    await request(app).post(`/create-form/${sessionId}`).set('Cookie', userCookie).send({
      nameRU: 'Тестовый чай', type: 'Улун', country: 'Китай', shop: 'Магазин',
      weight: 5, water: 'Родниковая', volume: 100, temperature: 90, price: 10,
      teaware: 'Гайвань', brewingtype: 'Проливы', averageRating: 7, publicAccess: false,
    });

    const res = await request(app).get('/admin/users').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const emails = res.body.data.map((u) => u.email);
    expect(emails).toContain('admin@example.com');
    expect(emails).toContain('plain@example.com');

    const plain = res.body.data.find((u) => u.email === 'plain@example.com');
    expect(plain.role).toBe('user');
    expect(plain.forms).toBe(1);
  });
});

describe('PATCH /admin/users/:id/role', () => {
  test('promotes and demotes a user', async () => {
    const up = await request(app)
      .patch(`/admin/users/${plainUser._id}/role`)
      .set('Cookie', adminCookie).send({ role: 'admin' });
    expect(up.status).toBe(200);
    expect(up.body.data.role).toBe('admin');

    const down = await request(app)
      .patch(`/admin/users/${plainUser._id}/role`)
      .set('Cookie', adminCookie).send({ role: 'user' });
    expect(down.body.data.role).toBe('user');
  });

  test('refuses to change your own role', async () => {
    const admin = await User.findOne({ email: 'admin@example.com' });
    const res = await request(app)
      .patch(`/admin/users/${admin._id}/role`)
      .set('Cookie', adminCookie).send({ role: 'user' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /admin/users/:id', () => {
  test('refuses to delete an admin', async () => {
    const admin = await User.findOne({ email: 'admin@example.com' });
    const res = await request(app)
      .delete(`/admin/users/${admin._id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(403);
  });

  test('deletes a user together with their tea data', async () => {
    const res = await request(app)
      .delete(`/admin/users/${plainUser._id}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    expect(await User.findById(plainUser._id)).toBeNull();
    expect(await Teaform.countDocuments({ owner: plainUser._id })).toBe(0);
  });
});
