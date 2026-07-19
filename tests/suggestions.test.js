/* Suggestions: any user can submit, only admins can read and dismiss. */
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const User = require('../models/user');
const Suggestion = require('../models/suggestion');

const mdbAddr = process.env.API_MONGO_URI || 'mongodb://localhost:27017/tea-taste-test';

const signUpAndIn = async (name, email) => {
  await request(app).post('/sign-up').send({ name, email, password: 'Passw0rd!' });
  const res = await request(app).post('/sign-in').send({ email, password: 'Passw0rd!' });
  return res.headers['set-cookie'];
};

let adminCookie;
let userCookie;

beforeAll(async () => {
  await mongoose.connect(mdbAddr);
  await User.deleteMany({});
  await Suggestion.deleteMany({});
  adminCookie = await signUpAndIn('SugAdmin', 'sug-admin@example.com');
  userCookie = await signUpAndIn('SugUser', 'sug-user@example.com');
  await User.updateOne({ email: 'sug-admin@example.com' }, { role: 'admin' });
});

afterAll(async () => {
  await User.deleteMany({});
  await Suggestion.deleteMany({});
  await mongoose.connection.close();
});

test('POST /suggestions requires auth', async () => {
  const res = await request(app).post('/suggestions').send({ text: 'Добавьте тёмную тему' });
  expect(res.status).toBe(401);
});

test('a user can submit a suggestion; too-short text is rejected', async () => {
  const bad = await request(app).post('/suggestions')
    .set('Cookie', userCookie).send({ text: 'аб' });
  expect(bad.status).toBe(400);

  const res = await request(app).post('/suggestions')
    .set('Cookie', userCookie).send({ text: 'Добавьте тёмную тему, пожалуйста' });
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});

test('a regular user cannot read the suggestion inbox', async () => {
  const res = await request(app).get('/admin/suggestions').set('Cookie', userCookie);
  expect(res.status).toBe(403);
});

test('an admin sees suggestions with the author attached', async () => {
  const res = await request(app).get('/admin/suggestions').set('Cookie', adminCookie);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBe(1);
  expect(res.body.data[0].text).toContain('тёмную тему');
  expect(res.body.data[0].owner.email).toBe('sug-user@example.com');
});

test('an admin can dismiss a suggestion', async () => {
  const list = await request(app).get('/admin/suggestions').set('Cookie', adminCookie);
  const id = list.body.data[0]._id;
  const res = await request(app).delete(`/admin/suggestions/${id}`).set('Cookie', adminCookie);
  expect(res.status).toBe(200);
  expect(await Suggestion.countDocuments({})).toBe(0);
});
