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

const created = [];   // filenames inside uploadDir
const tmpFiles = [];  // fixtures in the OS temp dir

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
    expect(form.voice.transcript).toBe('Готово.');
    expect(form.voice.track.url).toMatch(/^\/api\/uploads\/.+\.mp3$/);
    // Both segments are in there, so roughly the sum rather than one of them.
    expect(form.voice.track.duration).toBeGreaterThan(3.5);

    const trackFile = path.basename(form.voice.track.url);
    created.push(trackFile);
    expect(fs.existsSync(path.join(uploadDir, trackFile))).toBe(true);
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
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fs.existsSync(path.join(uploadDir, path.basename(segment)))).toBe(false);
    expect(fs.existsSync(path.join(uploadDir, path.basename(track)))).toBe(false);
  }, 30000);
});
