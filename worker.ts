import { Buffer } from 'node:buffer';
import { Db, MongoClient, ServerApiVersion } from 'mongodb';

type Env = {
  MONGODB_URI: string;
  MONGODB_DB_NAME?: string;
  ASSETS: Fetcher;
};

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let connectingPromise: Promise<Db> | null = null;
let currentUri: string | null = null;
let currentDbName: string | null = null;

function publicMongoError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/authentication failed|bad auth/i.test(msg)) return 'MongoDB-login fejlede. Tjek databasebruger og adgangskode.';
  if (/ENOTFOUND|querySrv|DNS/i.test(msg)) return 'MongoDB-adressen kunne ikke findes. Tjek connection string.';
  if (/timed out|server selection/i.test(msg)) return 'MongoDB kunne ikke nås. Tjek Atlas Network Access og connection string.';
  return msg || 'Ukendt MongoDB-fejl';
}

async function getMongoDb(env: Env): Promise<Db> {
  const uri = env.MONGODB_URI;
  const dbName = env.MONGODB_DB_NAME || 'workout_program';

  if (!uri) throw new Error('MONGODB_URI mangler i Cloudflare Worker secrets');

  if (mongoDb && currentUri === uri && currentDbName === dbName) return mongoDb;
  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    if (mongoClient && (currentUri !== uri || currentDbName !== dbName)) {
      await mongoClient.close().catch(() => undefined);
      mongoClient = null;
      mongoDb = null;
    }

    try {
      mongoClient = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
      });
      await mongoClient.connect();
      await mongoClient.db('admin').command({ ping: 1 });
      mongoDb = mongoClient.db(dbName);
      currentUri = uri;
      currentDbName = dbName;
      return mongoDb;
    } catch (err) {
      mongoDb = null;
      if (mongoClient) await mongoClient.close().catch(() => undefined);
      mongoClient = null;
      throw err;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

function clean<T extends Record<string, any>>(value: T): T {
  const { _id, ...rest } = value;
  return rest as T;
}

function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

function errorJson(err: unknown, status = 500): Response {
  return json({ error: err instanceof Error ? err.message : String(err || 'Ukendt serverfejl') }, status);
}

async function bodyJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/health' && method === 'GET') {
    try {
      const db = await getMongoDb(env);
      return json({ status: 'ok', database: 'mongodb', connected: true, databaseName: db.databaseName, serverTime: new Date().toISOString() });
    } catch (err) {
      return json({ status: 'error', database: 'mongodb', connected: false, error: publicMongoError(err), serverTime: new Date().toISOString() }, 503);
    }
  }

  if (path === '/api/db-status' && method === 'GET') {
    try {
      const db = await getMongoDb(env);
      return json({ type: 'mongodb', connected: true, databaseName: db.databaseName, hasMongoUri: Boolean(env.MONGODB_URI), error: null });
    } catch (err) {
      return json({ type: 'mongodb', connected: false, databaseName: env.MONGODB_DB_NAME || 'workout_program', hasMongoUri: Boolean(env.MONGODB_URI), error: publicMongoError(err) });
    }
  }

  if (path === '/api/db-retry' && method === 'POST') {
    if (mongoClient) await mongoClient.close().catch(() => undefined);
    mongoClient = null;
    mongoDb = null;
    currentUri = null;
    currentDbName = null;
    try {
      const db = await getMongoDb(env);
      return json({ success: true, connected: true, databaseName: db.databaseName, error: null });
    } catch (err) {
      return json({ success: false, connected: false, databaseName: env.MONGODB_DB_NAME || 'workout_program', error: publicMongoError(err) }, 503);
    }
  }

  let db: Db;
  try {
    db = await getMongoDb(env);
  } catch (err) {
    return json({ error: `Den fælles MongoDB-database er ikke tilgængelig: ${publicMongoError(err)}`, code: 'DATABASE_UNAVAILABLE' }, 503);
  }

  if (path === '/api/db-state' && method === 'GET') {
    const [exercises, plans, logs, sessions] = await Promise.all([
      db.collection('exercises').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('plans').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('logs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray(),
      db.collection('sessions').find({}, { projection: { _id: 0 } }).sort({ completedAt: -1 }).toArray(),
    ]);
    return json({ exercises, plans, logs, sessions });
  }

  if (path === '/api/sync' && method === 'POST') {
    const body = await bodyJson(request);
    const { exercises = [], plans = [], logs = [], sessions = [] } = body || {};
    const upsertAll = async (collection: string, items: any[]) => {
      for (const item of items) {
        if (!item?.id) continue;
        const doc = clean(item);
        await db.collection(collection).updateOne({ id: doc.id }, { $set: doc }, { upsert: true });
      }
    };
    await Promise.all([
      upsertAll('exercises', exercises),
      upsertAll('plans', plans),
      upsertAll('logs', logs),
      upsertAll('sessions', sessions),
    ]);
    return json({ success: true, mode: 'mongodb' });
  }

  if (path === '/api/exercises' && method === 'GET') {
    return json(await db.collection('exercises').find({}, { projection: { _id: 0 } }).toArray());
  }
  if (path === '/api/exercises' && method === 'POST') {
    const body = await bodyJson(request);
    if (!body?.id) return json({ error: 'Exercise and id are required' }, 400);
    const exercise = clean(body);
    await db.collection('exercises').updateOne({ id: exercise.id }, { $set: exercise }, { upsert: true });
    return json({ success: true, exercise, mode: 'mongodb' });
  }
  const exerciseDelete = path.match(/^\/api\/exercises\/([^/]+)$/);
  if (exerciseDelete && method === 'DELETE') {
    const id = decodeURIComponent(exerciseDelete[1]);
    await db.collection('exercises').deleteOne({ id });
    return json({ success: true, id, mode: 'mongodb' });
  }

  if (path === '/api/plans' && method === 'GET') {
    return json(await db.collection('plans').find({}, { projection: { _id: 0 } }).toArray());
  }
  if (path === '/api/plans' && method === 'POST') {
    const body = await bodyJson(request);
    if (!body?.id) return json({ error: 'Plan and id are required' }, 400);
    const plan = clean(body);
    await db.collection('plans').updateOne({ id: plan.id }, { $set: plan }, { upsert: true });
    return json({ success: true, plan, mode: 'mongodb' });
  }
  const planDelete = path.match(/^\/api\/plans\/([^/]+)$/);
  if (planDelete && method === 'DELETE') {
    const id = decodeURIComponent(planDelete[1]);
    await db.collection('plans').deleteOne({ id });
    return json({ success: true, id, mode: 'mongodb' });
  }

  if (path === '/api/logs' && method === 'GET') {
    return json(await db.collection('logs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray());
  }
  if (path === '/api/logs' && method === 'POST') {
    const body = await bodyJson(request);
    if (!body?.id) return json({ error: 'Log entry and id are required' }, 400);
    const entry = clean(body);
    await db.collection('logs').updateOne({ id: entry.id }, { $set: entry }, { upsert: true });
    return json({ success: true, entry, mode: 'mongodb' });
  }

  if (path === '/api/sessions' && method === 'GET') {
    return json(await db.collection('sessions').find({}, { projection: { _id: 0 } }).sort({ completedAt: -1 }).toArray());
  }
  if (path === '/api/sessions' && method === 'POST') {
    const body = await bodyJson(request);
    if (!body?.id) return json({ error: 'Session and id are required' }, 400);
    const session = clean(body);
    await db.collection('sessions').updateOne({ id: session.id }, { $set: session }, { upsert: true });
    if (Array.isArray(session.entries)) {
      for (const rawEntry of session.entries) {
        if (!rawEntry?.id) continue;
        const entry = clean(rawEntry);
        await db.collection('logs').updateOne({ id: entry.id }, { $set: entry }, { upsert: true });
      }
    }
    return json({ success: true, session, mode: 'mongodb' });
  }
  const sessionDelete = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionDelete && method === 'DELETE') {
    const id = decodeURIComponent(sessionDelete[1]);
    await db.collection('sessions').deleteOne({ id });
    return json({ success: true, id, mode: 'mongodb' });
  }

  if (path === '/api/active-draft' && method === 'GET') {
    const draft: any = await db.collection('drafts').findOne({ type: 'active_workout' }, { projection: { _id: 0 } });
    return json({ draft: draft?.data || null });
  }
  if (path === '/api/active-draft' && method === 'POST') {
    const body = await bodyJson(request);
    const draft = body?.draft;
    if (draft) {
      await db.collection('drafts').updateOne(
        { type: 'active_workout' },
        { $set: { type: 'active_workout', data: draft, updatedAt: new Date().toISOString() } },
        { upsert: true },
      );
    } else {
      await db.collection('drafts').deleteOne({ type: 'active_workout' });
    }
    return json({ success: true, mode: 'mongodb' });
  }
  if (path === '/api/active-draft' && method === 'DELETE') {
    await db.collection('drafts').deleteOne({ type: 'active_workout' });
    return json({ success: true, mode: 'mongodb' });
  }

  if (path === '/api/upload-image' && method === 'POST') {
    const body = await bodyJson(request);
    const { imageBase64, filename } = body || {};
    if (!imageBase64) return json({ error: 'No image provided' }, 400);
    if (/^https?:\/\//i.test(imageBase64)) return json({ success: true, url: imageBase64, mode: 'direct_url' });

    const matches = String(imageBase64).match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
    if (!matches) return json({ error: 'Billedet skal være en gyldig base64 data-URL.' }, 400);

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const safeFilename = typeof filename === 'string' ? filename.split(/[\\/]/).pop() : undefined;

    await db.collection('images').insertOne({
      id: imageId,
      filename: safeFilename || imageId,
      mimeType,
      data: buffer,
      size: buffer.length,
      createdAt: new Date().toISOString(),
    });
    return json({ success: true, url: `/api/images/${imageId}`, imageId, mode: 'mongodb' });
  }

  const imageGet = path.match(/^\/api\/images\/([^/]+)$/);
  if (imageGet && method === 'GET') {
    const id = decodeURIComponent(imageGet[1]);
    const doc: any = await db.collection('images').findOne({ id });
    if (!doc?.data) return new Response('Billede ikke fundet', { status: 404 });
    const data = doc.data?.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data);
    return new Response(data, {
      headers: {
        'Content-Type': doc.mimeType || 'image/jpeg',
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  const legacyImageGet = path.match(/^\/api\/uploads\/([^/]+)$/);
  if (legacyImageGet && method === 'GET') {
    const filename = decodeURIComponent(legacyImageGet[1]);
    const baseId = filename.replace(/\.[^/.]+$/, '');
    const doc: any = await db.collection('images').findOne({ $or: [{ filename }, { id: baseId }] });
    if (!doc?.data) return new Response('Billede ikke fundet', { status: 404 });
    const data = doc.data?.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data);
    return new Response(data, {
      headers: {
        'Content-Type': doc.mimeType || 'image/jpeg',
        'Content-Length': String(data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  }

  if (path === '/api/reset' && method === 'POST') {
    const body = await bodyJson(request);
    const { exercises = [], plans = [], logs = [] } = body || {};
    await Promise.all([
      db.collection('exercises').deleteMany({}),
      db.collection('plans').deleteMany({}),
      db.collection('logs').deleteMany({}),
      db.collection('sessions').deleteMany({}),
      db.collection('drafts').deleteMany({}),
    ]);
    if (exercises.length) await db.collection('exercises').insertMany(exercises.map(clean));
    if (plans.length) await db.collection('plans').insertMany(plans.map(clean));
    if (logs.length) await db.collection('logs').insertMany(logs.map(clean));
    return json({ success: true, mode: 'mongodb' });
  }

  return json({ error: 'API endpoint ikke fundet' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (err) {
        console.error('[API]', err);
        return errorJson(err, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
