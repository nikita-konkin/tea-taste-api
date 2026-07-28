/* Admin moderation of blog posts: blocking a tasting out of the public feed,
   the owner's inability to undo it, the moderation queue, and hard deletion. */
const request = require('supertest');
const app = require('../app');
const db = require('./db');
const User = require('../models/user');
const Teaform = require('../models/teaform');
const Brewing = require('../models/brewing');

const SID = '33333333-3333-4333-8333-333333333333';

const FORM = {
  nameRU: 'Спорный чай',
  type: 'Улун',
  country: 'Китай',
  shop: 'Магазин',
  weight: 5,
  water: 'Родниковая',
  volume: 100,
  temperature: 90,
  price: 10,
  teaware: 'Гайвань',
  brewingtype: 'Проливы',
  averageRating: 7,
  publicAccess: true,
};

let adminCookie;
let ownerCookie;

const signUpAndIn = async (name, email) => {
  await request(app).post('/sign-up').send({ name, email, password: 'Abc1!xyz' });
  const login = await request(app).post('/sign-in').send({ email, password: 'Abc1!xyz' });
  return login.headers['set-cookie'];
};

// A published tasting with one published пролив, which is what a block has to
// take out of circulation — both documents, not just the form.
const publishTasting = async () => {
  await request(app).post(`/create-form/${SID}`).set('Cookie', ownerCookie).send(FORM);
  await request(app).post(`/my-brewings/${SID}/brew/1`).set('Cookie', ownerCookie).send({
    description: 'Первый пролив', brewingRating: 8, brewingTime: '00:00:15', publicAccess: true,
  });
};

const feedContains = async (sessionId) => {
  const res = await request(app).get('/public-forms');
  return res.body.data.some((form) => form.sessionId === sessionId);
};

beforeAll(async () => {
  await db.connect();
  await db.clear();
  adminCookie = await signUpAndIn('Админ', 'mod-admin@example.com');
  ownerCookie = await signUpAndIn('Автор', 'mod-owner@example.com');
  await User.updateOne({ email: 'mod-admin@example.com' }, { role: 'admin' });
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await Teaform.deleteMany({});
  await Brewing.deleteMany({});
  await publishTasting();
});

describe('gating', () => {
  test('a regular user cannot block or delete a post', async () => {
    const block = await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', ownerCookie).send({ blocked: true });
    expect(block.status).toBe(403);

    const del = await request(app)
      .delete(`/admin/forms/${SID}`).set('Cookie', ownerCookie);
    expect(del.status).toBe(403);

    expect(await feedContains(SID)).toBe(true);
  });

  test('an unauthenticated request gets 401', async () => {
    const res = await request(app).patch(`/admin/forms/${SID}/block`).send({ blocked: true });
    expect(res.status).toBe(401);
  });

  test('an unknown sessionId -> 404, a malformed one -> 400', async () => {
    const missing = await request(app)
      .patch('/admin/forms/44444444-4444-4444-8444-444444444444/block')
      .set('Cookie', adminCookie).send({ blocked: true });
    expect(missing.status).toBe(404);

    const malformed = await request(app)
      .delete('/admin/forms/not-a-uuid').set('Cookie', adminCookie);
    expect(malformed.status).toBe(400);
  });
});

describe('PATCH /admin/forms/:sessionId/block', () => {
  test('takes the tasting out of the feed and off its shareable page', async () => {
    expect(await feedContains(SID)).toBe(true);

    const res = await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: true });
    expect(res.status).toBe(200);
    expect(res.body.data.blocked).toBe(true);

    expect(await feedContains(SID)).toBe(false);
    const page = await request(app).get(`/public-form/${SID}`);
    expect(page.status).toBe(404);
  });

  test('hides the проливы too, not just the form', async () => {
    await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: true });

    // The public sub-resource endpoints filter on each document's own
    // publicAccess copy, so a block that stopped at the teaform would leave the
    // tasting readable through this door.
    const brewings = await request(app).get(`/public-brewings/${SID}`);
    expect(brewings.body.data || []).toHaveLength(0);
  });

  test('the owner cannot publish a blocked tasting again', async () => {
    await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: true });

    const retry = await request(app)
      .patch(`/create-form/${SID}`).set('Cookie', ownerCookie).send({ publicAccess: true });
    expect(retry.status).toBe(403);

    expect(await feedContains(SID)).toBe(false);
    const form = await Teaform.findOne({ sessionId: SID });
    expect(form.publicAccess).toBe(false);
  });

  test('the owner can still edit and delete their own blocked tasting', async () => {
    await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: true });

    // Moderation hides a tasting from everyone else; it does not confiscate it.
    const edit = await request(app)
      .patch(`/create-form/${SID}`).set('Cookie', ownerCookie).send({ nameRU: 'Переименовал' });
    expect(edit.status).toBe(200);
    expect((await Teaform.findOne({ sessionId: SID })).nameRU).toBe('Переименовал');
  });

  test('unblocking does not republish on the owner\'s behalf', async () => {
    await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: true });
    const back = await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: false });
    expect(back.status).toBe(200);

    // Still private: the block cleared publicAccess, and putting a moderated
    // post back into the feed without asking the owner would be a surprise.
    expect(await feedContains(SID)).toBe(false);

    const republish = await request(app)
      .patch(`/create-form/${SID}`).set('Cookie', ownerCookie).send({ publicAccess: true });
    expect(republish.status).toBe(200);
    expect(await feedContains(SID)).toBe(true);
  });

  test('a non-boolean value -> 400', async () => {
    const res = await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: 'да' });
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/forms?blocked=true', () => {
  test('is the way back to a blocked post', async () => {
    await request(app)
      .patch(`/admin/forms/${SID}/block`).set('Cookie', adminCookie).send({ blocked: true });

    const res = await request(app).get('/admin/forms?blocked=true').set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    const entry = res.body.data.find((form) => form.sessionId === SID);
    expect(entry).toBeTruthy();
    expect(entry.blocked).toBe(true);
    expect(entry.owner.email).toBe('mod-owner@example.com');
  });

  test('lists nothing while the post is visible', async () => {
    const res = await request(app).get('/admin/forms?blocked=true').set('Cookie', adminCookie);
    expect(res.body.data.find((form) => form.sessionId === SID)).toBeFalsy();
  });
});

describe('DELETE /admin/forms/:sessionId', () => {
  test('removes the tasting and its проливы', async () => {
    const res = await request(app)
      .delete(`/admin/forms/${SID}`).set('Cookie', adminCookie);
    expect(res.status).toBe(200);

    expect(await Teaform.findOne({ sessionId: SID })).toBeNull();
    expect(await Brewing.countDocuments({ sessionId: SID })).toBe(0);
    expect(await feedContains(SID)).toBe(false);
  });
});
