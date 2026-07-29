const request = require('supertest');
const app = require('../app');
const db = require('./db');
const { buildSlug, slugifyName, looksLikeUuid } = require('../utils/slugify');

// The crawler-facing surface: readable slugs, the server-rendered HTML nginx
// hands to search engines, and the sitemap.
//
// What is asserted here is mostly *status codes and links*, because that is
// what the SPA could never get right — it answers 200 with an empty shell for
// every URL, including deleted tastings, and offers no anchor to follow.

const SID = '22222222-2222-4222-8222-222222222222';
const SID_PRIVATE = '33333333-3333-4333-8333-333333333333';
const YANDEX = 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)';

const formBody = {
  nameRU: 'Да Хун Пао',
  country: 'Китай',
  shop: 'Чайный дом',
  type: 'Улун (乌龙茶 - Wūlóng chá)',
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

let cookie;
let slug;

async function signUpAndIn(name, email) {
  await request(app).post('/sign-up').send({ name, email, password: 'Abc1!xyz' });
  const login = await request(app).post('/sign-in').send({ email, password: 'Abc1!xyz' });
  return login.headers['set-cookie'];
}

beforeAll(async () => {
  await db.connect();
  await db.clear();
  cookie = await signUpAndIn('Дегустатор', 'seo@example.com');

  await request(app).post(`/create-form/${SID}`).set('Cookie', cookie).send(formBody);
  await request(app).post(`/create-form/${SID_PRIVATE}`).set('Cookie', cookie)
    .send({ ...formBody, nameRU: 'Не для всех', publicAccess: false });

  const stored = await request(app).get(`/my-form/${SID}`).set('Cookie', cookie);
  slug = stored.body.data[0].slug;
});

afterAll(async () => {
  await db.close();
});

describe('slugs', () => {
  test('a new form gets a readable slug', () => {
    expect(slug).toMatch(/^da-hun-pao-[0-9a-f]{10}$/);
  });

  test('renaming the tea moves the readable half and keeps the suffix', async () => {
    await request(app).patch(`/create-form/${SID}`).set('Cookie', cookie)
      .send({ nameRU: 'Шуй Сянь' });
    const after = await request(app).get(`/my-form/${SID}`).set('Cookie', cookie);
    expect(after.body.data[0].slug).toBe(slug.replace('da-hun-pao', 'shuy-syan'));

    // Put it back — the rest of the suite reads the original address.
    await request(app).patch(`/create-form/${SID}`).set('Cookie', cookie)
      .send({ nameRU: formBody.nameRU });
  });

  test('a name that transliterates to nothing still yields a unique slug', () => {
    expect(slugifyName('普洱茶')).toBe('');
    expect(buildSlug('普洱茶', SID)).toMatch(/^[0-9a-f]{10}$/);
  });

  test('no sessionId yields no slug rather than a colliding one', () => {
    expect(buildSlug('Да Хун Пао', '')).toBe('');
  });

  // Regression: the suffix used to be the first characters of the sessionId,
  // which is only as unique as that prefix. Two sessionIds differing in their
  // last character alone produced the same slug, and the second save of the
  // same tea failed outright against the unique index.
  test('sessionIds differing only in the last character get different slugs', () => {
    const a = '77777777-7777-4777-8777-777777777777';
    const b = '77777777-7777-4777-8777-777777777778';
    expect(buildSlug('Шу Пуэр', a)).not.toBe(buildSlug('Шу Пуэр', b));
  });

  test('the same tasting always produces the same slug', () => {
    expect(buildSlug('Да Хун Пао', SID)).toBe(buildSlug('Да Хун Пао', SID));
  });

  test('a slug is never mistaken for a sessionId', () => {
    expect(looksLikeUuid(SID)).toBe(true);
    expect(looksLikeUuid(slug)).toBe(false);
  });

  test('the public endpoint resolves a form by slug and by sessionId', async () => {
    const bySlug = await request(app).get(`/public-form/${slug}`);
    const byId = await request(app).get(`/public-form/${SID}`);
    expect(bySlug.status).toBe(200);
    expect(byId.status).toBe(200);
    expect(bySlug.body.data.sessionId).toBe(SID);
  });
});

describe('GET /render/blog — the feed a crawler sees', () => {
  test('serves the tastings as HTML, not an empty shell', async () => {
    const res = await request(app).get('/render/blog').set('User-Agent', YANDEX);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<!DOCTYPE html>');
    expect(res.text).toContain('<html lang="ru">');
    expect(res.text).toContain('Да Хун Пао');
    expect(res.text).not.toContain('<div id="root"></div>');
  });

  // The single biggest gap this work closes: as buttons calling navigate(),
  // the feed offered no route into any tasting that a crawler could follow.
  test('links to each tasting, with the tea name as the anchor text', async () => {
    const res = await request(app).get('/render/blog').set('User-Agent', YANDEX);
    expect(res.text).toContain(`<a href="/blog/${slug}">Да Хун Пао`);
  });

  test('an unpublished tasting is not in it', async () => {
    const res = await request(app).get('/render/blog').set('User-Agent', YANDEX);
    expect(res.text).not.toContain('Не для всех');
  });

  test('canonical drops ?sort but keeps ?page', async () => {
    const sorted = await request(app).get('/render/blog?sort=rating');
    expect(sorted.text).toContain('<link rel="canonical" href="https://teaform.ru/blog" />');

    const paged = await request(app).get('/render/blog?page=2');
    expect(paged.text).toContain('<link rel="canonical" href="https://teaform.ru/blog?page=2" />');
  });
});

describe('GET /render/blog/type/:typeSlug — the tea-type hubs', () => {
  test('a hub lists only its own type', async () => {
    const res = await request(app).get('/render/blog/type/ulun');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Да Хун Пао');
    expect(res.text).toContain('<link rel="canonical" href="https://teaform.ru/blog/type/ulun" />');

    const other = await request(app).get('/render/blog/type/puer');
    expect(other.status).toBe(200);
    expect(other.text).not.toContain('Да Хун Пао');
  });

  test('an unknown type is a 404, not an empty feed answering 200', async () => {
    const res = await request(app).get('/render/blog/type/not-a-tea');
    expect(res.status).toBe(404);
  });
});

describe('GET /render/blog/:slugOrId — one tasting', () => {
  test('renders the tasting, its metadata and its schema', async () => {
    const res = await request(app).get(`/render/blog/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<h1>Да Хун Пао</h1>');
    expect(res.text).toContain(`<link rel="canonical" href="https://teaform.ru/blog/${slug}" />`);
    expect(res.text).toContain('"@type":"Review"');
    expect(res.text).toContain('Гайвань');
    expect(res.text).toContain('href="/blog/type/ulun"');
  });

  test('a sessionId URL 301s to the slug', async () => {
    const res = await request(app).get(`/render/blog/${SID}`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`/blog/${slug}`);
  });

  test('a tasting that does not exist is a 404', async () => {
    const res = await request(app).get('/render/blog/no-such-tea-000000');
    expect(res.status).toBe(404);
    expect(res.text).toContain('noindex');
  });

  test('an unpublished tasting is a 404, not a leak', async () => {
    const res = await request(app).get(`/render/blog/${SID_PRIVATE}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('Не для всех');
  });

  test('a blocked tasting stops being a page', async () => {
    const Teaform = require('../models/teaform');
    await Teaform.updateOne({ sessionId: SID }, { blocked: true });
    const res = await request(app).get(`/render/blog/${slug}`);
    expect(res.status).toBe(404);
    await Teaform.updateOne({ sessionId: SID }, { blocked: false });
  });
});

describe('GET /render/ — the landing page', () => {
  test('is a real page with links, not a redirect', async () => {
    const res = await request(app).get('/render/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('"@type":"WebSite"');
    expect(res.text).toContain('href="/blog"');
    expect(res.text).toContain('href="/sign-up"');
    expect(res.text).toContain('<link rel="canonical" href="https://teaform.ru/" />');
  });
});

describe('GET /sitemap.xml', () => {
  test('lists the root, the feed, every hub and the published tastings by slug', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<loc>https://teaform.ru/</loc>');
    expect(res.text).toContain('<loc>https://teaform.ru/blog</loc>');
    expect(res.text).toContain('<loc>https://teaform.ru/blog/type/puer</loc>');
    expect(res.text).toContain(`<loc>https://teaform.ru/blog/${slug}</loc>`);
  });

  test('does not list what is not public', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).not.toContain(SID_PRIVATE);
  });
});
