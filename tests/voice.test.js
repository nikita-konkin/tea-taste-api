const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const request = require('supertest');
const app = require('../app');
const db = require('./db');
const { uploadDir } = require('../middlewares/upload');
const TeaForm = require('../models/teaform');
const voiceJob = require('../utils/voiceJob');
const { extractTranscript, parseItems } = require('../utils/speechkit');

const PID = '77777777-7777-4777-8777-777777777777';

const formBody = {
  nameRU: 'Шу Пуэр',
  country: 'Китай',
  shop: 'Чайный дом',
  type: 'Пуэр',
  weight: 7,
  water: 'Родниковая',
  volume: 120,
  temperature: 98,
  price: 19.9,
  teaware: 'Гайвань',
  brewingtype: 'Проливы',
  publicAccess: false,
  averageRating: 7.5,
};

let cookieA;
let cookieB;
let userIdA;

const created = []; // filenames inside uploadDir
const tmpFiles = []; // fixtures in the OS temp dir

// Real recordings rather than mocked ones: ffmpeg is in the image because voice
// notes need it, so the transcode and concat paths can be exercised for real.
const ffmpeg = (args) => new Promise((resolve, reject) => {
  execFile('ffmpeg', args, (err, stdout, stderr) => (
    err ? reject(new Error(String(stderr || err.message).slice(-300))) : resolve()
  ));
});

const tone = (seconds, file, extra = []) => ffmpeg([
  '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, ...extra, file,
]);

const makeRecording = async (seconds, ext = 'webm', codec = 'libopus') => {
  const file = path.join(os.tmpdir(), `rec-${Date.now()}${Math.random().toString(16).slice(2)}.${ext}`);
  await tone(seconds, file, ['-c:a', codec, '-b:a', '32k']);
  tmpFiles.push(file);
  return file;
};

// A segment written straight into uploads/ under this user's prefix, skipping
// the HTTP route: used by the job tests, which are about merging, not uploading.
const placeSegment = async (seconds) => {
  const name = `${userIdA}-seg${Date.now()}${Math.random().toString(16).slice(2)}.mp3`;
  await tone(seconds, path.join(uploadDir, name), ['-ac', '1', '-ar', '16000', '-b:a', '48k']);
  created.push(name);
  return `/api/uploads/${name}`;
};

const uploadVoice = async (cookie, seconds = 1, contentType = 'audio/webm;codecs=opus') => {
  const file = await makeRecording(seconds);
  const res = await request(app).post('/upload/voice').set('Cookie', cookie)
    .attach('audio', file, { filename: 'note.webm', contentType });
  if (res.body && res.body.data && res.body.data.url) created.push(path.basename(res.body.data.url));
  return res;
};

const jsonRes = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
const textRes = (body) => ({ ok: true, status: 200, text: async () => body });

const stubSpeechKit = (recognitionBody) => {
  global.fetch = jest.fn(async (url) => {
    const target = String(url);
    if (target.includes('/recognizeFileAsync')) return jsonRes({ id: 'op-test-1' });
    if (target.includes('/operations/')) return jsonRes({ done: true });
    if (target.includes('/getRecognition')) return textRes(recognitionBody);
    if (target.includes('/deleteRecognition')) return textRes('');
    throw new Error(`unexpected fetch: ${target}`);
  });
};

async function signUpAndIn(name, email) {
  await request(app).post('/sign-up').send({ name, email, password: 'Abc1!xyz' });
  const login = await request(app).post('/sign-in').send({ email, password: 'Abc1!xyz' });
  return login.headers['set-cookie'];
}

const setVoice = (fields) => TeaForm.updateOne({ owner: userIdA, sessionId: PID }, fields);
const getForm = () => TeaForm.findOne({ owner: userIdA, sessionId: PID });

beforeAll(async () => {
  await db.connect();
  await db.clear();
  cookieA = await signUpAndIn('Диктор', 'voice-owner@example.com');
  cookieB = await signUpAndIn('Чужой', 'voice-stranger@example.com');
  const me = await request(app).get('/profile/me').set('Cookie', cookieA);
  userIdA = String(me.body.data._id);
  await request(app).post(`/create-form/${PID}`).set('Cookie', cookieA).send(formBody);
});

afterAll(async () => {
  delete global.fetch;
  delete process.env.YC_API_KEY;
  delete process.env.YC_FOLDER_ID;
  await Promise.all(created.map((f) => fs.promises.unlink(path.join(uploadDir, f)).catch(() => {})));
  await Promise.all(tmpFiles.map((f) => fs.promises.unlink(f).catch(() => {})));
  await db.close();
});

describe('POST /upload/voice', () => {
  test('401 without a cookie', async () => {
    const file = await makeRecording(1);
    const res = await request(app).post('/upload/voice')
      .attach('audio', file, { filename: 'note.webm', contentType: 'audio/webm' });
    expect(res.status).toBe(401);
  });

  test('transcodes the recording to mp3 and reports its duration', async () => {
    const res = await uploadVoice(cookieA, 2);
    expect(res.status).toBe(200);
    // The browser records webm/opus; SpeechKit only accepts WAV/OGG_OPUS/MP3.
    expect(res.body.data.url).toMatch(/^\/api\/uploads\/.+\.mp3$/);
    expect(res.body.data.duration).toBeGreaterThan(1.5);
    expect(res.body.data.duration).toBeLessThan(3);

    const filename = path.basename(res.body.data.url);
    expect(filename.startsWith(`${userIdA}-`)).toBe(true);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(true);
    // The original container is not left behind next to the converted file.
    expect(fs.existsSync(path.join(uploadDir, filename.replace(/\.mp3$/, '.webm')))).toBe(false);
  }, 30000);

  test('accepts a mimetype carrying codec parameters', async () => {
    // MediaRecorder blobs are "audio/webm;codecs=opus", not a bare type.
    const res = await uploadVoice(cookieA, 1, 'audio/webm;codecs=opus');
    expect(res.status).toBe(200);
  }, 30000);

  test('an mp3 upload still lands as a single mp3', async () => {
    // normalizeToMp3 would otherwise have ffmpeg read and write one path.
    const file = path.join(os.tmpdir(), `rec-${Date.now()}.mp3`);
    await tone(1, file, ['-ac', '1', '-ar', '16000', '-b:a', '48k']);
    tmpFiles.push(file);

    const res = await request(app).post('/upload/voice').set('Cookie', cookieA)
      .attach('audio', file, { filename: 'note.mp3', contentType: 'audio/mpeg' });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/\.mp3$/);
    const filename = path.basename(res.body.data.url);
    created.push(filename);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(true);
  }, 30000);

  test('rejects a non-audio file', async () => {
    const res = await request(app).post('/upload/voice').set('Cookie', cookieA)
      .attach('audio', Buffer.from('hello'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/аудиозаписи/);
  });

  test('rejects a request with no file', async () => {
    const res = await request(app).post('/upload/voice').set('Cookie', cookieA);
    expect(res.status).toBe(400);
  });

  test('rejects an oversized recording', async () => {
    const res = await request(app).post('/upload/voice').set('Cookie', cookieA)
      .attach('audio', Buffer.alloc(13 * 1024 * 1024, 1), {
        filename: 'huge.webm', contentType: 'audio/webm',
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/12 МБ/);
  }, 30000);

  test('an image is not accepted as a recording', async () => {
    const res = await request(app).post('/upload/voice').set('Cookie', cookieA)
      .attach('audio', Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        filename: 'leaf.png', contentType: 'image/png',
      });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /upload/voice/:filename', () => {
  test('removes own recording and is idempotent', async () => {
    const upload = await uploadVoice(cookieA, 1);
    const filename = path.basename(upload.body.data.url);

    const first = await request(app).delete(`/upload/voice/${filename}`).set('Cookie', cookieA);
    expect(first.status).toBe(204);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(false);

    const second = await request(app).delete(`/upload/voice/${filename}`).set('Cookie', cookieA);
    expect(second.status).toBe(204);
  }, 30000);

  test("403 on another user's recording, which survives", async () => {
    const upload = await uploadVoice(cookieA, 1);
    const filename = path.basename(upload.body.data.url);

    const res = await request(app).delete(`/upload/voice/${filename}`).set('Cookie', cookieB);
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(uploadDir, filename))).toBe(true);
  }, 30000);

  test('403 on a traversal attempt, leaving app.js in place', async () => {
    const res = await request(app).delete('/upload/voice/..%2F..%2Fapp.js').set('Cookie', cookieA);
    expect(res.status).toBe(403);
    expect(fs.existsSync(path.join(__dirname, '..', 'app.js'))).toBe(true);
  });
});

describe('voice on the tasting form', () => {
  test('stores segments sent with the form and queues recognition', async () => {
    const res = await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA).send({
      ...formBody,
      voice: {
        segments: [
          { url: '/api/uploads/a-1.mp3', brewingNumber: 1, duration: 12.5 },
          { url: '/api/uploads/a-2.mp3', brewingNumber: 2, duration: 9 },
        ],
      },
    });
    expect(res.status).toBe(200);

    const form = await getForm();
    expect(form.voice.segments).toHaveLength(2);
    expect(form.voice.segments[0].brewingNumber).toBe(1);
    expect(form.voice.status).toBe('queued');
  });

  test('a PATCH that omits voice preserves the segments and the transcript', async () => {
    await setVoice({ 'voice.transcript': 'Первый пролив цветочный.', 'voice.status': 'done' });

    const res = await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA).send(formBody);
    expect(res.status).toBe(200);

    const form = await getForm();
    expect(form.voice.segments).toHaveLength(2);
    expect(form.voice.transcript).toBe('Первый пролив цветочный.');
    expect(form.voice.status).toBe('done');
  });

  test('the client cannot write the transcript or the status', async () => {
    // The edit dialog echoes the whole voice object back. Accepting its copy
    // would let a dialog opened before recognition finished save over the
    // transcript that arrived while it was open.
    const res = await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA).send({
      ...formBody,
      voice: {
        segments: [{ url: '/api/uploads/a-1.mp3', brewingNumber: 1, duration: 12.5 }],
        transcript: 'подделка',
        status: 'done',
        operationId: 'op-injected',
      },
    });
    expect(res.status).toBe(200);

    const form = await getForm();
    expect(form.voice.transcript).toBe('Первый пролив цветочный.');
    expect(form.voice.status).toBe('queued');
    expect(form.voice.operationId || '').not.toBe('op-injected');
    expect(form.voice.segments).toHaveLength(1);
  });

  test('an empty segment list clears the transcript and the track too', async () => {
    await setVoice({
      'voice.transcript': 'что-то было',
      'voice.track': { url: '/api/uploads/a-track.mp3', duration: 30 },
    });

    const res = await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA)
      .send({ ...formBody, voice: { segments: [] } });
    expect(res.status).toBe(200);

    const form = await getForm();
    expect(form.voice.segments).toHaveLength(0);
    expect(form.voice.transcript).toBe('');
    expect(form.voice.track.url).toBe('');
    expect(form.voice.status).toBe('idle');
  });

  test.each([
    ['more than twenty segments', {
      segments: Array.from({ length: 21 }, (_, i) => ({ url: `/api/uploads/a-${i}.mp3` })),
    }],
    ['an off-site url', { segments: [{ url: 'https://evil.example/x.mp3' }] }],
    ['a traversal url', { segments: [{ url: '/api/uploads/../../app.js' }] }],
    ['a segment with no url', { segments: [{ brewingNumber: 1 }] }],
    ['a duration past ten minutes', { segments: [{ url: '/api/uploads/a.mp3', duration: 601 }] }],
    ['an out-of-range brewing number', { segments: [{ url: '/api/uploads/a.mp3', brewingNumber: 51 }] }],
    ['an unknown status', { segments: [], status: 'finished' }],
    ['an unknown key', { segments: [], nonsense: 1 }],
  ])('rejects %s', async (_label, voice) => {
    const res = await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA)
      .send({ ...formBody, voice });
    expect(res.status).toBe(400);
  });
});

describe('GET /my-form/:sessionId/voice', () => {
  test('reports the recognition state', async () => {
    await setVoice({
      'voice.status': 'processing',
      'voice.transcript': '',
      'voice.error': '',
    });

    const res = await request(app).get(`/my-form/${PID}/voice`).set('Cookie', cookieA);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'processing', transcript: '', error: '' });
  });

  test('404 for a form that is not yours', async () => {
    const res = await request(app).get(`/my-form/${PID}/voice`).set('Cookie', cookieB);
    expect(res.status).toBe(404);
  });
});

describe('speechkit transcript parsing', () => {
  test('prefers the normalized refinement and does not repeat the raw text', () => {
    // With literatureText on, every utterance is reported twice — once raw as
    // `final`, once normalized as `finalRefinement`. Concatenating both would
    // duplicate the whole transcript.
    const items = parseItems([
      '{"result":{"final":{"alternatives":[{"text":"сухой лист пахнет черносливом"}]}}}',
      '{"result":{"finalRefinement":{"normalizedText":{"alternatives":[{"text":"Сухой лист пахнет черносливом."}]}}}}',
    ].join('\n'));

    expect(extractTranscript(items)).toBe('Сухой лист пахнет черносливом.');
  });

  test('falls back to the raw text when nothing was refined', () => {
    const items = parseItems('{"result":{"final":{"alternatives":[{"text":"настой густой"}]}}}');
    expect(extractTranscript(items)).toBe('настой густой');
  });

  // The regression behind a real transcript that lost its middle: SpeechKit
  // refines each final separately and can skip one, and preferring refinements
  // as a group threw every unrefined utterance away.
  test('an utterance that came back unrefined is kept, not dropped', () => {
    const refinement = (finalIndex, text) => ({
      result: { finalRefinement: { finalIndex, normalizedText: { alternatives: [{ text }] } } },
    });
    const final = (text) => ({ result: { final: { alternatives: [{ text }] } } });

    const items = parseItems(JSON.stringify([
      final('шу пуэр название неопуэр'),
      refinement('0', 'Шу пуэр, название неопуэр.'),
      final('магазин мой чай'),
      final('пять грамм заварка'),
      refinement('2', '5 грамм заварка.'),
    ]));

    expect(extractTranscript(items))
      .toBe('Шу пуэр, название неопуэр. магазин мой чай 5 грамм заварка.');
  });

  // proto3 JSON leaves out an int64 that is zero, so the first refinement
  // usually arrives with no finalIndex at all.
  test('a refinement with no index refines the first final', () => {
    const items = parseItems(JSON.stringify([
      { result: { final: { alternatives: [{ text: 'настой густой' }] } } },
      { result: { finalRefinement: { normalizedText: { alternatives: [{ text: 'Настой густой.' }] } } } },
      { result: { final: { alternatives: [{ text: 'вкус ореховый' }] } } },
    ]));

    expect(extractTranscript(items)).toBe('Настой густой. вкус ореховый');
  });

  test('reads a JSON array body as well as newline-delimited objects', () => {
    const items = parseItems(JSON.stringify([
      { result: { final: { alternatives: [{ text: 'первый' }] } } },
      { result: { final: { alternatives: [{ text: 'второй' }] } } },
    ]));
    expect(extractTranscript(items)).toBe('первый второй');
  });
});

describe('the merge and recognition job', () => {
  test('orders segments by пролив, general note first, recording order kept', () => {
    // The merged track has the same length whichever order it is built in, so
    // this is the only place the sequence itself is checked.
    const ordered = voiceJob.orderedSegments({
      segments: [
        { url: '/api/uploads/b.mp3', brewingNumber: 2 },
        { url: '/api/uploads/g.mp3', brewingNumber: 0 },
        { url: '/api/uploads/a1.mp3', brewingNumber: 1 },
        { url: '/api/uploads/a2.mp3', brewingNumber: 1 },
      ],
    });

    expect(ordered.map((s) => path.basename(s.url))).toEqual([
      'g.mp3', 'a1.mp3', 'a2.mp3', 'b.mp3',
    ]);
  });

  test('joins the segments in пролив order and saves the transcript', async () => {
    process.env.YC_API_KEY = 'test-key';
    process.env.YC_FOLDER_ID = 'test-folder';
    stubSpeechKit('{"result":{"finalRefinement":{"normalizedText":{"alternatives":[{"text":"Готово."}]}}}}');

    const second = await placeSegment(2);
    const first = await placeSegment(2);
    await setVoice({
      'voice.segments': [
        { url: second, brewingNumber: 2, duration: 2 },
        { url: first, brewingNumber: 1, duration: 2 },
      ],
      'voice.status': 'queued',
      'voice.transcript': '',
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(form.voice.status).toBe('done');
    // Two проливы, so two recognitions and two parts — the пролив a note
    // belongs to is the user's own answer and is no longer inferred.
    expect(form.voice.parts.map((p) => p.brewingNumber)).toEqual([1, 2]);
    // The flat transcript is the readable join, headed by пролив.
    expect(form.voice.transcript).toBe('Пролив 1. Готово.\nПролив 2. Готово.');
    // The playable track is still every segment end to end, in пролив order.
    expect(form.voice.track.url).toMatch(/^\/api\/uploads\/.+\.mp3$/);
    expect(form.voice.track.duration).toBeGreaterThan(3.5);

    const trackFile = path.basename(form.voice.track.url);
    created.push(trackFile);
    expect(fs.existsSync(path.join(uploadDir, trackFile))).toBe(true);
  }, 60000);

  // The reason both are stored. Recognition returns the raw final and its
  // normalized refinement in one response; the normalizer is what turned a real
  // «пять с половиной грамм» into «5 15 Грамм», so the reader gets the tidy
  // string and the field extraction gets what was actually said.
  test('keeps the readable transcript and the unrewritten one apart', async () => {
    process.env.YC_API_KEY = 'test-key';
    process.env.YC_FOLDER_ID = 'test-folder';
    stubSpeechKit(JSON.stringify([
      { result: { final: { alternatives: [{ text: 'пять с половиной грамм заварка' }] } } },
      {
        result: {
          finalRefinement: {
            finalIndex: '0',
            normalizedText: { alternatives: [{ text: '5 15 Грамм заварка.' }] },
          },
        },
      },
    ]));

    const only = await placeSegment(2);
    await setVoice({
      'voice.segments': [{ url: only, brewingNumber: 0, duration: 2 }],
      'voice.status': 'queued',
      'voice.transcript': '',
      'voice.transcriptRaw': '',
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(form.voice.transcript).toBe('5 15 Грамм заварка.');
    expect(form.voice.transcriptRaw).toBe('пять с половиной грамм заварка');

    created.push(path.basename(form.voice.track.url));
  }, 60000);

  // The model is pinned on purpose: unset, `deferred-general` and
  // `deferred-general:rc` were measured returning byte-identical text, so this
  // is a guard against the default moving, not a quality setting. A silent
  // disappearance would put that guard back to chance.
  test('recognition is submitted against the pinned model', async () => {
    process.env.YC_API_KEY = 'test-key';
    process.env.YC_FOLDER_ID = 'test-folder';
    stubSpeechKit('{"result":{"final":{"alternatives":[{"text":"проверка"}]}}}');

    const only = await placeSegment(2);
    await setVoice({
      'voice.segments': [{ url: only, brewingNumber: 0, duration: 2 }],
      'voice.status': 'queued',
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const submit = global.fetch.mock.calls
      .find(([url]) => String(url).includes('/recognizeFileAsync'));
    expect(submit).toBeDefined();
    const body = JSON.parse(submit[1].body);
    expect(body.recognitionModel.model).toBe('deferred-general');
    // Normalization stays on: it is what makes SpeechKit send the refinement
    // that the readable transcript is built from.
    expect(body.recognitionModel.textNormalization.textNormalization)
      .toBe('TEXT_NORMALIZATION_ENABLED');

    const form = await getForm();
    created.push(path.basename(form.voice.track.url));
  }, 60000);

  test('without SpeechKit keys it still merges, and stays idle', async () => {
    delete process.env.YC_API_KEY;
    delete process.env.YC_FOLDER_ID;
    global.fetch = jest.fn(async () => { throw new Error('should not be called'); });

    const only = await placeSegment(1);
    await setVoice({
      'voice.segments': [{ url: only, brewingNumber: 0, duration: 1 }],
      'voice.status': 'queued',
      'voice.transcript': '',
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(form.voice.status).toBe('idle');
    expect(form.voice.transcript).toBe('');
    expect(form.voice.track.url).toMatch(/\.mp3$/);
    expect(global.fetch).not.toHaveBeenCalled();
    created.push(path.basename(form.voice.track.url));
  }, 60000);

  test('refuses a merged track longer than five minutes', async () => {
    const long = await placeSegment(302);
    await setVoice({
      'voice.segments': [{ url: long, brewingNumber: 1, duration: 302 }],
      'voice.status': 'queued',
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(form.voice.status).toBe('error');
    expect(form.voice.error).toMatch(/максимум 300/);
    // The over-long track is not left on disk.
    expect(form.voice.track.url).toBe('');
  }, 120000);

  test('reports missing segment files instead of hanging', async () => {
    await setVoice({
      'voice.segments': [{ url: `/api/uploads/${userIdA}-gone.mp3`, brewingNumber: 1, duration: 5 }],
      'voice.status': 'queued',
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(form.voice.status).toBe('error');
    expect(form.voice.error).toMatch(/не найдены/);
  }, 30000);
});

// The one change here where a regression leaks something rather than just
// looking wrong: a recording catches whoever else was in the room, so it must be
// absent from the public payload — not merely hidden by the frontend.
// The bug this split exists for: notes recorded against проливы 1..6 were merged
// into one track, recognised as one job, and the model was left to find the
// boundaries in the words. It found three, so проливы 4-6 got no suggestion at
// all and everything unattributable landed in the overall description.
describe('each пролив is recognised on its own', () => {
  test('two проливы, two recognitions, text attributed to the right one', async () => {
    process.env.YC_API_KEY = 'test-key';
    process.env.YC_FOLDER_ID = 'test-folder';

    // A different transcript per submission, so this asserts attribution rather
    // than merely that something came back.
    const said = ['первый лёгкий', 'второй терпкий', 'лишний'];
    const bodies = new Map();
    let submitted = 0;

    global.fetch = jest.fn(async (url) => {
      const target = String(url);
      if (target.includes('/recognizeFileAsync')) {
        const id = `op-part-${submitted}`;
        bodies.set(id, JSON.stringify({
          result: { final: { alternatives: [{ text: said[submitted] }] } },
        }));
        submitted += 1;
        return jsonRes({ id });
      }
      if (target.includes('/operations/')) return jsonRes({ done: true });
      if (target.includes('/getRecognition')) {
        const id = decodeURIComponent(target.split('operationId=')[1] || '');
        return textRes(bodies.get(id) || '');
      }
      if (target.includes('/deleteRecognition')) return textRes('');
      throw new Error(`unexpected fetch: ${target}`);
    });

    const late = await placeSegment(2);
    const earlyA = await placeSegment(2);
    const earlyB = await placeSegment(2);

    await setVoice({
      // Deliberately out of order, and пролив 1 carries two notes: grouping is
      // by the user's number, not by upload order or one job per file.
      'voice.segments': [
        { url: late, brewingNumber: 3, duration: 2 },
        { url: earlyA, brewingNumber: 1, duration: 2 },
        { url: earlyB, brewingNumber: 1, duration: 2 },
      ],
      'voice.status': 'queued',
      'voice.transcript': '',
      'voice.parts': [],
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(submitted).toBe(2);
    expect(form.voice.parts.map((part) => part.brewingNumber)).toEqual([1, 3]);
    expect(form.voice.parts[0].transcript).toBe('первый лёгкий');
    expect(form.voice.parts[1].transcript).toBe('второй терпкий');
    // Пролив 3 keeps its number: the gap where пролив 2 was never recorded is
    // real, and closing it would move a note onto the wrong пролив.
    expect(form.voice.parts[1].brewingNumber).toBe(3);
    // Nothing left outstanding once everything is collected.
    expect(form.voice.pending).toEqual([]);

    created.push(path.basename(form.voice.track.url));
  }, 60000);
});

// A recording made outside the app and imported whole: one file, every пролив
// inside it, boundaries carried by the numbers the taster spoke rather than by
// which block the file was dropped into.
describe('a whole-session import', () => {
  test('is its own recognition job, never merged with the «о чае» note', async () => {
    process.env.YC_API_KEY = 'test-key';
    process.env.YC_FOLDER_ID = 'test-folder';

    const said = ['общая заметка', 'первый пролив лёгкий второй пролив терпкий'];
    const bodies = new Map();
    let submitted = 0;

    global.fetch = jest.fn(async (url) => {
      const target = String(url);
      if (target.includes('/recognizeFileAsync')) {
        const id = `op-whole-${submitted}`;
        bodies.set(id, JSON.stringify({
          result: { final: { alternatives: [{ text: said[submitted] }] } },
        }));
        submitted += 1;
        return jsonRes({ id });
      }
      if (target.includes('/operations/')) return jsonRes({ done: true });
      if (target.includes('/getRecognition')) {
        const id = decodeURIComponent(target.split('operationId=')[1] || '');
        return textRes(bodies.get(id) || '');
      }
      if (target.includes('/deleteRecognition')) return textRes('');
      throw new Error(`unexpected fetch: ${target}`);
    });

    const general = await placeSegment(2);
    const session = await placeSegment(2);

    await setVoice({
      // Both carry brewingNumber 0. Grouped by number alone they would become
      // one job and the whole tasting would be read as a note about the tea.
      'voice.segments': [
        { url: general, brewingNumber: 0, duration: 2 },
        { url: session, brewingNumber: 0, duration: 2, whole: true },
      ],
      'voice.status': 'queued',
      'voice.transcript': '',
      'voice.parts': [],
      'voice.track': { url: '', duration: 0 },
    });

    await voiceJob.run(userIdA, PID);

    const form = await getForm();
    expect(submitted).toBe(2);
    expect(form.voice.parts.map((p) => Boolean(p.whole))).toEqual([false, true]);
    expect(form.voice.parts[0].transcript).toBe('общая заметка');
    expect(form.voice.parts[1].transcript).toBe('первый пролив лёгкий второй пролив терпкий');
    // The flat transcript names it for what it is.
    expect(form.voice.transcript).toContain('Вся сессия.');
    expect(form.voice.transcript).toContain('О чае.');

    created.push(path.basename(form.voice.track.url));
  }, 60000);
});

describe('the transcript handed to the extractor', () => {
  const { userText } = require('../utils/extractForm');

  test('every note is labelled with the пролив the user recorded it in', () => {
    const text = userText([
      { brewingNumber: 0, transcript: 'взял на пробу' },
      { brewingNumber: 1, transcript: 'лёгкий' },
      { brewingNumber: 4, transcript: 'терпкий' },
    ]);

    expect(text).toContain('[О чае] взял на пробу');
    expect(text).toContain('[Пролив 1] лёгкий');
    expect(text).toContain('[Пролив 4] терпкий');
    // Проливы 2 and 3 were never recorded against. The gap is data, not an
    // error to tidy away by renumbering.
    expect(text).not.toContain('[Пролив 2]');
    expect(text).not.toContain('[Пролив 3]');
  });

  test('a whole-session import is labelled as such, not as a пролив note', () => {
    const text = userText([
      { brewingNumber: 0, whole: true, transcript: 'первый пролив лёгкий второй пролив терпкий' },
    ]);

    // «[О чае]» measurably cost the descriptors: the model read the whole
    // tasting as one general remark and returned no aromas or tastes at all.
    expect(text).toContain('[Вся сессия] первый пролив');
    expect(text).not.toContain('[О чае]');
  });

  test('one undivided recording is passed through unlabelled', () => {
    const text = userText('просто текст');
    expect(text).toContain('просто текст');
    expect(text).not.toContain('[Пролив');
  });
});

describe('the recording is withheld from public views until shared', () => {
  beforeAll(async () => {
    await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA)
      .send({ ...formBody, publicAccess: true });
    await setVoice({
      'voice.segments': [{ url: '/api/uploads/a-1.mp3', brewingNumber: 1, duration: 12 }],
      'voice.track': { url: '/api/uploads/a-track.mp3', duration: 12 },
      'voice.transcript': 'Слышно как в комнате разговаривают.',
      'voice.status': 'done',
      'voice.public': false,
    });
  });

  test('a public tasting does not expose an unshared recording', async () => {
    const res = await request(app).get(`/public-form/${PID}`);
    expect(res.status).toBe(200);
    // Published as a tasting...
    expect(res.body.data.nameRU).toBe(formBody.nameRU);
    // ...but the audio is not in the payload at all.
    expect(res.body.data.voice).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('в комнате разговаривают');
    expect(JSON.stringify(res.body)).not.toContain('a-track.mp3');
  });

  test('the public feed does not expose it either', async () => {
    const res = await request(app).get('/public-forms');
    expect(res.status).toBe(200);
    const mine = res.body.data.find((form) => form.sessionId === PID);
    expect(mine).toBeDefined();
    expect(mine.voice).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('a-track.mp3');
  });

  test('the owner still sees their own recording', async () => {
    const res = await request(app).get(`/my-form/${PID}`).set('Cookie', cookieA);
    expect(res.status).toBe(200);
    // This endpoint answers with find(), so data is an array.
    expect(res.body.data[0].voice.transcript).toMatch(/в комнате разговаривают/);
  });

  test('once the owner shares it, the public form carries it', async () => {
    const patched = await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA)
      .send({ ...formBody, publicAccess: true, voice: { public: true } });
    expect(patched.status).toBe(200);

    const res = await request(app).get(`/public-form/${PID}`);
    expect(res.body.data.voice.transcript).toMatch(/в комнате разговаривают/);
    expect(res.body.data.voice.track.url).toBe('/api/uploads/a-track.mp3');
  });

  test('sharing the audio does not let the client rewrite the transcript', async () => {
    await request(app).patch(`/create-form/${PID}`).set('Cookie', cookieA)
      .send({ ...formBody, publicAccess: true, voice: { public: true, transcript: 'подмена' } });

    const form = await getForm();
    expect(form.voice.transcript).toMatch(/в комнате разговаривают/);
    expect(form.voice.public).toBe(true);
  });

  test('a tasting saved with a recording is not published on creation', async () => {
    // The wizard cannot know what else ended up on the tape, so publicAccess
    // is forced off at creation even when the form asked for it.
    const fresh = '77777777-7777-4777-8777-777777777778';
    const res = await request(app).post(`/create-form/${fresh}`).set('Cookie', cookieA).send({
      ...formBody,
      publicAccess: true,
      voice: { segments: [{ url: '/api/uploads/b-1.mp3', brewingNumber: 0, duration: 5 }] },
    });
    expect(res.status).toBe(200);

    const saved = await TeaForm.findOne({ owner: userIdA, sessionId: fresh });
    expect(saved.publicAccess).toBe(false);
    expect(saved.voice.public).toBe(false);

    await TeaForm.deleteOne({ _id: saved._id });
  });
});

describe('deleting the form', () => {
  test('unlinks the segments and the merged track', async () => {
    const segment = await placeSegment(1);
    const track = await placeSegment(1);
    await setVoice({
      'voice.segments': [{ url: segment, brewingNumber: 1, duration: 1 }],
      'voice.track': { url: track, duration: 1 },
    });

    const res = await request(app).delete(`/my-form/${PID}`).set('Cookie', cookieA);
    expect(res.status).toBe(200);

    // The unlink is fired on response finish, so give the event loop a tick.
    await new Promise((resolve) => { setTimeout(resolve, 300); });
    expect(fs.existsSync(path.join(uploadDir, path.basename(segment)))).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, path.basename(track)))).toBe(false);
  }, 30000);
});

// The resolver rewrites what the model produced into vocabulary entries, so its
// rules are worth pinning: a near-miss that silently resolves onto the catch-all
// category loses the descriptor entirely — neither stored nor mentioned in the
// description — and nothing downstream would reveal it.
describe('descriptor resolution against the vocabulary', () => {
  const { keepKnown } = require('../utils/extractForm');
  const known = new Set([
    'Овощной', 'Овощной → Томат', 'Пряный', 'Другое',
    'Терпкий', 'Ферментированный', 'Ферментированный → Спиртовой',
  ]);

  test('resolves a descriptor filed under the wrong branch', () => {
    expect(keepKnown(['Другое → Спиртовой'], known).kept)
      .toEqual(['Ферментированный → Спиртовой']);
  });

  test('an unresolvable path is reported so it can reach the description', () => {
    const { kept, dropped } = keepKnown(['Другое → Спиртовой оттенок'], known);
    expect(kept).toEqual([]);
    expect(dropped).toEqual(['Другое → Спиртовой оттенок']);
  });

  test('the catch-all category is discarded, not written into the description', () => {
    const { kept, dropped } = keepKnown(['Другое', 'Терпкий'], known);
    expect(kept).toEqual(['Терпкий']);
    expect(dropped).toEqual([]);
  });

  test('a parent implied by its own child is collapsed', () => {
    expect(keepKnown(['Овощной → Томат', 'Пряный', 'Овощной'], known).kept)
      .toEqual(['Овощной → Томат', 'Пряный']);
  });

  test('matching ignores case, ё and punctuation', () => {
    expect(keepKnown(['овощной→томат'], known).kept).toEqual(['Овощной → Томат']);
  });

  test('the same descriptor twice is kept once', () => {
    expect(keepKnown(['Пряный', 'Пряный'], known).kept).toEqual(['Пряный']);
  });
});

// The quota is what stands between one user and an unbounded SpeechKit bill, and
// it is booked before any audio is sent — refusing afterwards would be billed.
describe('monthly transcription quota', () => {
  const { reserve, MONTHLY_LIMIT_SECONDS, currentPeriod } = require('../utils/voiceQuota');
  const User = require('../models/user');

  beforeEach(() => User.updateOne(
    { _id: userIdA },
    { voiceSeconds: 0, voicePeriod: currentPeriod() },
  ));

  test('accumulates across recordings', async () => {
    expect((await reserve(userIdA, 60)).used).toBe(60);
    expect((await reserve(userIdA, 90)).used).toBe(150);
  });

  test('refuses once the month is spent, and says how much is left', async () => {
    await reserve(userIdA, MONTHLY_LIMIT_SECONDS - 30);
    const denied = await reserve(userIdA, 120);
    expect(denied.ok).toBe(false);
    expect(denied.reason).toMatch(/лимит/i);

    // Nothing is booked for a refused request.
    const user = await User.findById(userIdA).select('voiceSeconds');
    expect(user.voiceSeconds).toBe(MONTHLY_LIMIT_SECONDS - 30);
  });

  test('a new month starts the allowance over', async () => {
    await User.updateOne(
      { _id: userIdA },
      { voiceSeconds: MONTHLY_LIMIT_SECONDS, voicePeriod: '2001-01' },
    );
    const fresh = await reserve(userIdA, 300);
    expect(fresh.ok).toBe(true);
    expect(fresh.used).toBe(300);
  });
});
