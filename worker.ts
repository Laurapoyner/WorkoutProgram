import { Buffer } from 'node:buffer';
import { Db, MongoClient, ServerApiVersion } from 'mongodb';
import { EXORLIVE_IMAGE_UPDATES, LSI_EXERCISES, LSI_PLAN, LSI_HISTORICAL_LOGS, LSI_HISTORICAL_SESSIONS, REHAB_MIGRATION_ID } from './src/db/rehabSeed';

type Env = {
  MONGODB_URI: string;
  MONGODB_DB_NAME?: string;
  ASSETS: Fetcher;
};


function publicMongoError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/authentication failed|bad auth/i.test(msg)) return 'MongoDB-login fejlede. Tjek databasebruger og adgangskode.';
  if (/ENOTFOUND|querySrv|DNS/i.test(msg)) return 'MongoDB-adressen kunne ikke findes. Tjek connection string.';
  if (/timed out|server selection/i.test(msg)) return 'MongoDB kunne ikke nås. Tjek Atlas Network Access og connection string.';
  return msg || 'Ukendt MongoDB-fejl';
}

async function openMongoDb(env: Env): Promise<{ client: MongoClient; db: Db }> {
  const uri = env.MONGODB_URI;
  const dbName = env.MONGODB_DB_NAME || 'workout_program';

  if (!uri) throw new Error('MONGODB_URI mangler i Cloudflare Worker secrets');

  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    connectTimeoutMS: 8000,
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 1,
    minPoolSize: 0,
    maxConnecting: 1,
    maxIdleTimeMS: 1000,
  });

  try {
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });
    return { client, db };
  } catch (err) {
    await client.close().catch(() => undefined);
    throw err;
  }
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
    let client: MongoClient | null = null;
    try {
      const connection = await openMongoDb(env);
      client = connection.client;
      return json({ status: 'ok', database: 'mongodb', connected: true, databaseName: connection.db.databaseName, serverTime: new Date().toISOString() });
    } catch (err) {
      return json({ status: 'error', database: 'mongodb', connected: false, error: publicMongoError(err), serverTime: new Date().toISOString() }, 503);
    } finally {
      if (client) await client.close().catch(() => undefined);
    }
  }

  if (path === '/api/db-status' && method === 'GET') {
    let client: MongoClient | null = null;
    try {
      const connection = await openMongoDb(env);
      client = connection.client;
      return json({ type: 'mongodb', connected: true, databaseName: connection.db.databaseName, hasMongoUri: Boolean(env.MONGODB_URI), error: null });
    } catch (err) {
      return json({ type: 'mongodb', connected: false, databaseName: env.MONGODB_DB_NAME || 'workout_program', hasMongoUri: Boolean(env.MONGODB_URI), error: publicMongoError(err) });
    } finally {
      if (client) await client.close().catch(() => undefined);
    }
  }

  if (path === '/api/db-retry' && method === 'POST') {
    let client: MongoClient | null = null;
    try {
      const connection = await openMongoDb(env);
      client = connection.client;
      return json({ success: true, connected: true, databaseName: connection.db.databaseName, error: null });
    } catch (err) {
      return json({ success: false, connected: false, databaseName: env.MONGODB_DB_NAME || 'workout_program', error: publicMongoError(err) }, 503);
    } finally {
      if (client) await client.close().catch(() => undefined);
    }
  }

  let client: MongoClient | null = null;
  let db: Db;
  try {
    const connection = await openMongoDb(env);
    client = connection.client;
    db = connection.db;
  } catch (err) {
    return json({ error: `Den fælles MongoDB-database er ikke tilgængelig: ${publicMongoError(err)}`, code: 'DATABASE_UNAVAILABLE' }, 503);
  }

  try {

  if (path === '/api/db-state' && method === 'GET') {
    const [exercises, plans, logs, sessions] = await Promise.all([
      db.collection('exercises').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('plans').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('logs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray(),
      db.collection('sessions').find({}, { projection: { _id: 0 } }).sort({ completedAt: -1 }).toArray(),
    ]);
    return json({ exercises, plans, logs, sessions });
  }

  if (path === '/api/migrations/rehab-2026' && method === 'POST') {
    const migrations = db.collection('migrations');
    const already = await migrations.findOne({ id: REHAB_MIGRATION_ID });
    if (already) return json({ success: true, alreadyApplied: true, migrationId: REHAB_MIGRATION_ID });

    // Give the 12 ExorLive exercises their real PDF illustrations without recreating them.
    for (const update of EXORLIVE_IMAGE_UPDATES) {
      await db.collection('exercises').updateOne(
        { id: update.id },
        { $set: { imageUrl: update.imageUrl, imagePosition: update.imagePosition, updatedAt: update.updatedAt } },
      );
    }

    // Add the standardized LSI protocol, its five tests and the user's historical measurements.
    for (const exercise of LSI_EXERCISES) {
      await db.collection('exercises').updateOne({ id: exercise.id }, { $setOnInsert: clean(exercise) }, { upsert: true });
    }
    await db.collection('plans').updateOne({ id: LSI_PLAN.id }, { $setOnInsert: clean(LSI_PLAN) }, { upsert: true });
    for (const entry of LSI_HISTORICAL_LOGS) {
      await db.collection('logs').updateOne({ id: entry.id }, { $setOnInsert: clean(entry) }, { upsert: true });
    }
    for (const session of LSI_HISTORICAL_SESSIONS) {
      await db.collection('sessions').updateOne({ id: session.id }, { $setOnInsert: clean(session) }, { upsert: true });
    }

    await migrations.insertOne({ id: REHAB_MIGRATION_ID, appliedAt: new Date().toISOString() });
    return json({ success: true, alreadyApplied: false, migrationId: REHAB_MIGRATION_ID });
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

  // Multiple independent workout drafts. A draft is keyed by its stable draft.id, and each plan
  // normally has one current draft. This lets the user pause one workout and start another.
  if (path === '/api/drafts' && method === 'GET') {
    const docs: any[] = await db.collection('drafts')
      .find({ type: 'workout_draft' }, { projection: { _id: 0, data: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .toArray();
    return json({ drafts: docs.map((d) => d.data).filter(Boolean) });
  }
  if (path === '/api/drafts' && method === 'POST') {
    const body = await bodyJson(request);
    const draft = body?.draft;
    if (!draft?.planId) return json({ error: 'Draft og planId er påkrævet' }, 400);
    const normalized = {
      ...draft,
      id: draft.id || `draft-${draft.planId}`,
      lastUpdated: draft.lastUpdated || new Date().toISOString(),
    };
    await db.collection('drafts').updateOne(
      { type: 'workout_draft', 'data.id': normalized.id },
      { $set: { type: 'workout_draft', planId: normalized.planId, data: normalized, updatedAt: normalized.lastUpdated } },
      { upsert: true },
    );
    return json({ success: true, draft: normalized, mode: 'mongodb' });
  }
  const draftByPlan = path.match(/^\/api\/drafts\/plan\/([^/]+)$/);
  if (draftByPlan && method === 'GET') {
    const planId = decodeURIComponent(draftByPlan[1]);
    const doc: any = await db.collection('drafts').findOne(
      { type: 'workout_draft', planId },
      { projection: { _id: 0, data: 1 } },
    );
    return json({ draft: doc?.data || null });
  }
  const draftDelete = path.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftDelete && method === 'DELETE') {
    const id = decodeURIComponent(draftDelete[1]);
    await db.collection('drafts').deleteOne({ type: 'workout_draft', 'data.id': id });
    return json({ success: true, id, mode: 'mongodb' });
  }

  // Legacy endpoint kept for compatibility with older deployed clients.
  if (path === '/api/active-draft' && method === 'GET') {
    const doc: any = await db.collection('drafts').findOne(
      { type: 'workout_draft' },
      { projection: { _id: 0, data: 1 }, sort: { updatedAt: -1 } as any },
    );
    return json({ draft: doc?.data || null });
  }
  if (path === '/api/active-draft' && method === 'POST') {
    const body = await bodyJson(request);
    const draft = body?.draft;
    if (!draft?.planId) return json({ error: 'Draft og planId er påkrævet' }, 400);
    const normalized = { ...draft, id: draft.id || `draft-${draft.planId}` };
    await db.collection('drafts').updateOne(
      { type: 'workout_draft', 'data.id': normalized.id },
      { $set: { type: 'workout_draft', planId: normalized.planId, data: normalized, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
    return json({ success: true, mode: 'mongodb' });
  }
  if (path === '/api/active-draft' && method === 'DELETE') {
    await db.collection('drafts').deleteMany({ type: { $in: ['workout_draft', 'active_workout'] } });
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
  } finally {
    if (client) await client.close().catch(() => undefined);
  }
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
