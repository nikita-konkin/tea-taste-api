const request = require('supertest');
const app = require('../app');
const db = require('./db');
const { messages } = require('../utils/messages');
const { localeFromPath, localizePath, stripLocale, LOCALES } = require('../utils/locale');
const { translateDescriptorPath } = require('../utils/descriptors');
const { teaTypeName } = require('../utils/teaTypes');

// Three languages in the crawler HTML: /blog, /en/blog, /zh/blog.
//
// The app renders these in the browser; this file covers the copy a search
// engine is actually served, where a wrong canonical or a missing hreflang is
// invisible until the wrong page is the one that ranks.

const SID = '44444444-4444-4444-8444-444444444444';

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

beforeAll(async () => {
  await db.connect();
  await db.clear();
  await request(app).post('/sign-up').send({ name: 'Дегустатор', email: 'i18n@example.com', password: 'Abc1!xyz' });
  const login = await request(app).post('/sign-in').send({ email: 'i18n@example.com', password: 'Abc1!xyz' });
  cookie = login.headers['set-cookie'];

  await request(app).post(`/create-form/${SID}`).set('Cookie', cookie).send(formBody);
  const stored = await request(app).get(`/my-form/${SID}`).set('Cookie', cookie);
  slug = stored.body.data[0].slug;
});

afterAll(async () => { await db.close(); });

describe('locale helpers agree with the frontend', () => {
  test('the prefix decides the language, and only as the first segment', () => {
    expect(localeFromPath('/render/blog')).toBe('ru');
    expect(localeFromPath('/en/blog')).toBe('en');
    expect(localeFromPath('/zh/blog/type/puer')).toBe('zh');
    // A tea slug that happens to start with a language code is not a language.
    expect(localeFromPath('/blog/en-shi-yu-lu-abc123')).toBe('ru');
  });

  test('stripping and re-adding a prefix round-trips', () => {
    for (const path of ['/', '/blog', '/blog/type/puer', '/blog/da-hun-pao-abc']) {
      for (const locale of LOCALES) {
        expect(stripLocale(localizePath(path, locale))).toBe(path);
      }
    }
  });

  test('the root under a prefix carries no trailing slash', () => {
    expect(localizePath('/', 'en')).toBe('/en');
    expect(localizePath('/', 'ru')).toBe('/');
  });

  test('every Russian key exists in English and Chinese', () => {
    const ru = Object.keys(messages.ru).sort();
    expect(Object.keys(messages.en).sort()).toEqual(ru);
    expect(Object.keys(messages.zh).sort()).toEqual(ru);
  });
});

describe('the tasting page in each language', () => {
  test('Russian stays at the bare path', async () => {
    const res = await request(app).get(`/render/blog/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="ru">');
    expect(res.text).toContain('Тип чая');
    expect(res.text).toContain('Улун');
    expect(res.text).toContain(`<link rel="canonical" href="https://teaform.ru/blog/${slug}" />`);
  });

  test('English translates the labels, the tea type and the descriptors', async () => {
    const res = await request(app).get(`/render/en/blog/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="en">');
    expect(res.text).toContain('Tea type');
    expect(res.text).toContain('Oolong');
    expect(res.text).toContain('Teaware');
    expect(res.text).toContain(`<link rel="canonical" href="https://teaform.ru/en/blog/${slug}" />`);
  });

  test('Chinese does the same, with zh-Hans as the language tag', async () => {
    const res = await request(app).get(`/render/zh/blog/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="zh-Hans">');
    expect(res.text).toContain('茶类');
    expect(res.text).toContain('乌龙茶');
    expect(res.text).toContain(`<link rel="canonical" href="https://teaform.ru/zh/blog/${slug}" />`);
  });

  // The name is the author's, not the site's.
  test('the tea name is never translated', async () => {
    for (const path of ['', '/en', '/zh']) {
      const res = await request(app).get(`/render${path}/blog/${slug}`);
      expect(res.text).toContain('<h1>Да Хун Пао</h1>');
    }
  });

  // Regression: utils/formMeta.js is a mirror of the frontend's copy and went
  // stale — it kept the pre-translation signature, so render.js passed a locale
  // that was silently ignored and every translated page carried a Russian meta
  // description beside its translated body. The <dl> labels render.js builds
  // itself were fine, which is why nothing else here noticed.
  test('the meta description and schema are translated, not just the labels', async () => {
    const en = await request(app).get(`/render/en/blog/${slug}`);
    const enDesc = (en.text.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    expect(enDesc).toContain('Tea tasting');
    expect(enDesc).toContain('Oolong');
    expect(enDesc).toContain('China');
    expect(enDesc).not.toMatch(/Улун|Китай/);
    expect(en.text).toContain('"inLanguage":"en"');
    expect(en.text).toContain('"countryOfOrigin":"China"');

    const zh = await request(app).get(`/render/zh/blog/${slug}`);
    const zhDesc = (zh.text.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    expect(zhDesc).toContain('乌龙茶');
    expect(zhDesc).toContain('中国');
    expect(zh.text).toContain('"inLanguage":"zh-Hans"');
  });

  test('every language declares the other two, plus x-default', async () => {
    const res = await request(app).get(`/render/en/blog/${slug}`);
    for (const [tag, path] of [
      ['ru', `/blog/${slug}`],
      ['en', `/en/blog/${slug}`],
      ['zh-Hans', `/zh/blog/${slug}`],
      ['x-default', `/blog/${slug}`],
    ]) {
      expect(res.text).toContain(`<link rel="alternate" hreflang="${tag}" href="https://teaform.ru${path}" />`);
    }
  });

  test('links inside a translated page keep the reader in that language', async () => {
    const res = await request(app).get(`/render/zh/blog/${slug}`);
    expect(res.text).toContain('href="/zh/blog"');
    expect(res.text).toContain('href="/zh/blog/type/ulun"');

    // Scoped to the article, not the whole document: the footer ends with the
    // language switcher, whose entire job is to point out of the current
    // language. Checking every href on the page flags its (correct) Russian
    // link as a defect.
    const article = res.text.split('</article>')[0];
    const hrefs = [...article.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.filter((h) => !h.startsWith('/zh'))).toEqual([]);
  });

  test('an old uuid link redirects within its own language', async () => {
    const res = await request(app).get(`/render/zh/blog/${SID}`);
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe(`/zh/blog/${slug}`);
  });

  test('a missing tasting is a 404 in every language, with no alternates', async () => {
    for (const path of ['', '/en', '/zh']) {
      const res = await request(app).get(`/render${path}/blog/no-such-tea-0000000000`);
      expect(res.status).toBe(404);
      expect(res.text).toContain('noindex');
      expect(res.text).not.toContain('rel="alternate"');
    }
  });
});

describe('the feed and hubs in each language', () => {
  test('the feed heading and description are translated', async () => {
    const en = await request(app).get('/render/en/blog');
    expect(en.text).toContain('Public tastings');
    const zh = await request(app).get('/render/zh/blog');
    expect(zh.text).toContain('公开记录');
  });

  test('a tea-type hub keeps its slug but translates its name', async () => {
    const en = await request(app).get('/render/en/blog/type/ulun');
    expect(en.status).toBe(200);
    expect(en.text).toContain('Oolong');
    expect(en.text).toContain('<link rel="canonical" href="https://teaform.ru/en/blog/type/ulun" />');

    const zh = await request(app).get('/render/zh/blog/type/puer');
    expect(zh.status).toBe(200);
    expect(zh.text).toContain('普洱茶');
  });

  test('an unknown type is still a 404 under a prefix', async () => {
    const res = await request(app).get('/render/en/blog/type/not-a-tea');
    expect(res.status).toBe(404);
  });

  test('the landing page is translated and reachable in each language', async () => {
    const ru = await request(app).get('/render/');
    const en = await request(app).get('/render/en');
    const zh = await request(app).get('/render/zh');
    expect([ru.status, en.status, zh.status]).toEqual([200, 200, 200]);
    expect(en.text).toContain('How it works');
    expect(zh.text).toContain('如何使用');
    expect(en.text).toContain('<link rel="canonical" href="https://teaform.ru/en" />');
  });
});

describe('descriptors and tea types', () => {
  test('a stored Russian descriptor path renders in each language', () => {
    const path = 'Цветочный → Жасмин';
    expect(translateDescriptorPath(path, 'ru')).toBe(path);
    expect(translateDescriptorPath(path, 'en')).toBe('Floral → Jasmine');
    expect(translateDescriptorPath(path, 'zh')).toBe('花香 → 茉莉');
  });

  test('an untranslated descriptor falls back to the stored Russian', () => {
    expect(translateDescriptorPath('Цветочный → Небывалый', 'en')).toBe('Floral → Небывалый');
  });

  test('a stored tea type label resolves per language', () => {
    const oolong = 'Улун (乌龙茶 - Wūlóng chá)';
    expect(teaTypeName(oolong, 'en')).toBe('Oolong');
    expect(teaTypeName(oolong, 'zh')).toBe('乌龙茶');
    expect(teaTypeName('Каркаде', 'en')).toBe('Каркаде');
  });
});

describe('API messages answer in the reader’s language', () => {
  // X-Locale first: the app knows which language the page is being read at,
  // which Accept-Language cannot tell us.
  test('X-Locale decides', async () => {
    const ru = await request(app).get('/profile/me');
    const en = await request(app).get('/profile/me').set('X-Locale', 'en');
    const zh = await request(app).get('/profile/me').set('X-Locale', 'zh');
    expect([ru.status, en.status, zh.status]).toEqual([401, 401, 401]);
    expect(ru.body.message).toBe('Необходима авторизация.');
    expect(en.body.message).toBe('You need to sign in.');
    expect(zh.body.message).toBe('请先登录。');
  });

  test('Accept-Language is the fallback for anything that is not the app', async () => {
    const res = await request(app).get('/profile/me').set('Accept-Language', 'en-GB,en;q=0.9');
    expect(res.body.message).toBe('You need to sign in.');
  });

  // A client that says nothing must behave exactly as it did before any of this.
  test('no header at all means Russian', async () => {
    const res = await request(app).get('/profile/me');
    expect(res.body.message).toBe('Необходима авторизация.');
  });

  test('an unknown language falls back to Russian rather than the key', async () => {
    const res = await request(app).get('/profile/me').set('X-Locale', 'de');
    expect(res.body.message).toBe('Необходима авторизация.');
  });

  // The header is untrusted: only an exact match against the known locales counts.
  test('a junk X-Locale cannot reach the tables', async () => {
    const res = await request(app).get('/profile/me').set('X-Locale', '../../etc/passwd');
    expect(res.body.message).toBe('Необходима авторизация.');
  });

  test('sign-in failure is translated too', async () => {
    const res = await request(app).post('/sign-in')
      .set('X-Locale', 'en')
      .send({ email: 'i18n@example.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Wrong email or password');
  });

  test('the response declares that it varies by language', async () => {
    const res = await request(app).get('/profile/me').set('X-Locale', 'en');
    expect(String(res.headers.vary)).toMatch(/X-Locale/i);
  });

  test('every API message exists in all three languages', () => {
    const { MESSAGES } = require('../utils/apiMessages');
    const ru = Object.keys(MESSAGES.ru).sort();
    expect(Object.keys(MESSAGES.en).sort()).toEqual(ru);
    expect(Object.keys(MESSAGES.zh).sort()).toEqual(ru);
  });
});

describe('GET /sitemap.xml', () => {
  test('lists every page in all three languages', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    for (const loc of [
      'https://teaform.ru/', 'https://teaform.ru/en', 'https://teaform.ru/zh',
      'https://teaform.ru/blog', 'https://teaform.ru/en/blog', 'https://teaform.ru/zh/blog',
      'https://teaform.ru/blog/type/puer', 'https://teaform.ru/zh/blog/type/puer',
      `https://teaform.ru/en/blog/${slug}`,
    ]) {
      expect(res.text).toContain(`<loc>${loc}</loc>`);
    }
  });

  test('declares the xhtml namespace and the alternates that need it', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.text).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(res.text).toContain('<xhtml:link rel="alternate" hreflang="zh-Hans" href="https://teaform.ru/zh/blog" />');
    expect(res.text).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://teaform.ru/blog" />');
  });

  // The same photograph in three languages is still one photograph.
  test('images are declared once, on the Russian entry', async () => {
    const res = await request(app).get('/sitemap.xml');
    const zhBlock = res.text.split(`<loc>https://teaform.ru/zh/blog/${slug}</loc>`)[1] || '';
    expect(zhBlock.split('</url>')[0]).not.toContain('<image:image>');
  });
});
