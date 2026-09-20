import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { MongoClient, Db, ServerApiVersion } from 'mongodb';

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.MONGODB_DB_NAME || 'workout_program';

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let mongoError: string | null = null;
let connectingPromise: Promise<Db> | null = null;

function publicMongoError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/authentication failed|bad auth/i.test(msg)) return 'MongoDB-login fejlede. Tjek databasebruger og adgangskode.';
  if (/ENOTFOUND|querySrv|DNS/i.test(msg)) return 'MongoDB-adressen kunne ikke findes. Tjek connection string.';
  if (/timed out|server selection/i.test(msg)) return 'MongoDB kunne ikke nås. Tjek Atlas Network Access og connection string.';
  return msg || 'Ukendt MongoDB-fejl';
}

async function getMongoDb(): Promise<Db> {
  if (mongoDb) return mongoDb;
  if (connectingPromise) return connectingPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    mongoError = 'MONGODB_URI mangler på serveren';
    throw new Error(mongoError);
  }

  connectingPromise = (async () => {
    try {
      mongoClient = new MongoClient(uri, {
        serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
      });
      await mongoClient.connect();
      await mongoClient.db('admin').command({ ping: 1 });
      mongoDb = mongoClient.db(DB_NAME);
      mongoError = null;
      console.log(`[MongoDB] Connected to ${mongoDb.databaseName}`);
      return mongoDb;
    } catch (err) {
      mongoError = publicMongoError(err);
      mongoDb = null;
      if (mongoClient) await mongoClient.close().catch(() => {});
      mongoClient = null;
      throw err;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

async function requireDb(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.db = await getMongoDb();
    next();
  } catch (err) {
    res.status(503).json({
      error: `Den fælles MongoDB-database er ikke tilgængelig: ${publicMongoError(err)}`,
      code: 'DATABASE_UNAVAILABLE',
    });
  }
}

function clean<T extends Record<string, any>>(value: T): T {
  const { _id, ...rest } = value;
  return rest as T;
}

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getMongoDb();
    res.json({ status: 'ok', database: 'mongodb', connected: true, databaseName: db.databaseName, serverTime: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'mongodb', connected: false, error: publicMongoError(err), serverTime: new Date().toISOString() });
  }
});

app.get('/api/db-status', async (_req, res) => {
  try {
    const db = await getMongoDb();
    res.json({ type: 'mongodb', connected: true, databaseName: db.databaseName, hasMongoUri: Boolean(process.env.MONGODB_URI), error: null });
  } catch (err) {
    res.json({ type: 'mongodb', connected: false, databaseName: DB_NAME, hasMongoUri: Boolean(process.env.MONGODB_URI), error: publicMongoError(err) });
  }
});

app.post('/api/db-retry', async (_req, res) => {
  if (mongoClient) await mongoClient.close().catch(() => {});
  mongoClient = null;
  mongoDb = null;
  try {
    const db = await getMongoDb();
    res.json({ success: true, connected: true, databaseName: db.databaseName, error: null });
  } catch (err) {
    res.status(503).json({ success: false, connected: false, databaseName: DB_NAME, error: publicMongoError(err) });
  }
});

app.get('/api/db-state', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  const [exercises, plans, logs, sessions] = await Promise.all([
    db.collection('exercises').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('plans').find({}, { projection: { _id: 0 } }).toArray(),
    db.collection('logs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray(),
    db.collection('sessions').find({}, { projection: { _id: 0 } }).sort({ completedAt: -1 }).toArray(),
  ]);
  res.json({ exercises, plans, logs, sessions });
});

app.post('/api/sync', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  const { exercises = [], plans = [], logs = [], sessions = [] } = req.body || {};
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
  res.json({ success: true, mode: 'mongodb' });
});

app.get('/api/exercises', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  res.json(await db.collection('exercises').find({}, { projection: { _id: 0 } }).toArray());
});

app.post('/api/exercises', requireDb, async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ error: 'Exercise and id are required' });
  const db: Db = res.locals.db;
  const exercise = clean(req.body);
  await db.collection('exercises').updateOne({ id: exercise.id }, { $set: exercise }, { upsert: true });
  res.json({ success: true, exercise, mode: 'mongodb' });
});

app.delete('/api/exercises/:id', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  await db.collection('exercises').deleteOne({ id: req.params.id });
  res.json({ success: true, id: req.params.id, mode: 'mongodb' });
});

app.get('/api/plans', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  res.json(await db.collection('plans').find({}, { projection: { _id: 0 } }).toArray());
});

app.post('/api/plans', requireDb, async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ error: 'Plan and id are required' });
  const db: Db = res.locals.db;
  const plan = clean(req.body);
  await db.collection('plans').updateOne({ id: plan.id }, { $set: plan }, { upsert: true });
  res.json({ success: true, plan, mode: 'mongodb' });
});

app.delete('/api/plans/:id', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  await db.collection('plans').deleteOne({ id: req.params.id });
  res.json({ success: true, id: req.params.id, mode: 'mongodb' });
});

app.get('/api/logs', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  res.json(await db.collection('logs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray());
});

app.post('/api/logs', requireDb, async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ error: 'Log entry and id are required' });
  const db: Db = res.locals.db;
  const entry = clean(req.body);
  await db.collection('logs').updateOne({ id: entry.id }, { $set: entry }, { upsert: true });
  res.json({ success: true, entry, mode: 'mongodb' });
});

app.get('/api/sessions', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  res.json(await db.collection('sessions').find({}, { projection: { _id: 0 } }).sort({ completedAt: -1 }).toArray());
});

app.post('/api/sessions', requireDb, async (req, res) => {
  if (!req.body?.id) return res.status(400).json({ error: 'Session and id are required' });
  const db: Db = res.locals.db;
  const session = clean(req.body);
  await db.collection('sessions').updateOne({ id: session.id }, { $set: session }, { upsert: true });
  if (Array.isArray(session.entries)) {
    for (const rawEntry of session.entries) {
      if (!rawEntry?.id) continue;
      const entry = clean(rawEntry);
      await db.collection('logs').updateOne({ id: entry.id }, { $set: entry }, { upsert: true });
    }
  }
  res.json({ success: true, session, mode: 'mongodb' });
});

app.delete('/api/sessions/:id', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  await db.collection('sessions').deleteOne({ id: req.params.id });
  res.json({ success: true, id: req.params.id, mode: 'mongodb' });
});

app.get('/api/active-draft', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  const draft = await db.collection('drafts').findOne({ type: 'active_workout' }, { projection: { _id: 0 } });
  res.json({ draft: draft?.data || null });
});

app.post('/api/active-draft', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  const draft = req.body?.draft;
  if (draft) {
    await db.collection('drafts').updateOne(
      { type: 'active_workout' },
      { $set: { type: 'active_workout', data: draft, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  } else {
    await db.collection('drafts').deleteOne({ type: 'active_workout' });
  }
  res.json({ success: true, mode: 'mongodb' });
});

app.delete('/api/active-draft', requireDb, async (_req, res) => {
  const db: Db = res.locals.db;
  await db.collection('drafts').deleteOne({ type: 'active_workout' });
  res.json({ success: true, mode: 'mongodb' });
});

app.post('/api/upload-image', requireDb, async (req, res) => {
  const { imageBase64, filename } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  // Existing remote URLs can be stored directly on the exercise without upload.
  if (/^https?:\/\//i.test(imageBase64)) {
    return res.json({ success: true, url: imageBase64, mode: 'direct_url' });
  }

  const matches = String(imageBase64).match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ error: 'Billedet skal være en gyldig base64 data-URL.' });

  const db: Db = res.locals.db;
  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const imageId = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const safeFilename = typeof filename === 'string' ? path.basename(filename) : undefined;

  await db.collection('images').insertOne({
    id: imageId,
    filename: safeFilename || imageId,
    mimeType,
    data: buffer,
    size: buffer.length,
    createdAt: new Date().toISOString(),
  });

  res.json({ success: true, url: `/api/images/${imageId}`, imageId, mode: 'mongodb' });
});

app.get('/api/images/:id', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  const doc: any = await db.collection('images').findOne({ id: req.params.id });
  if (!doc?.data) return res.status(404).send('Billede ikke fundet');
  const data = doc.data?.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data);
  res.set({ 'Content-Type': doc.mimeType || 'image/jpeg', 'Content-Length': String(data.length), 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.send(data);
});

app.get('/api/uploads/:filename', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  const filename = req.params.filename;
  const doc: any = await db.collection('images').findOne({ $or: [{ filename }, { id: filename.replace(/\.[^/.]+$/, '') }] });
  if (!doc?.data) return res.status(404).send('Billede ikke fundet');
  const data = doc.data?.buffer ? Buffer.from(doc.data.buffer) : Buffer.from(doc.data);
  res.set({ 'Content-Type': doc.mimeType || 'image/jpeg', 'Content-Length': String(data.length), 'Cache-Control': 'public, max-age=31536000, immutable' });
  res.send(data);
});

app.post('/api/reset', requireDb, async (req, res) => {
  const db: Db = res.locals.db;
  const { exercises = [], plans = [], logs = [] } = req.body || {};
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
  res.json({ success: true, mode: 'mongodb' });
});

// Return useful JSON instead of silently falling back if an API handler throws.
app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[API]', err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Ukendt serverfejl' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Workout system running on http://localhost:${PORT}`);
    if (!process.env.MONGODB_URI) console.warn('[MongoDB] MONGODB_URI is not configured. API writes/reads will fail until it is set.');
  });
}

startServer();
