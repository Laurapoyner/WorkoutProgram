import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { MongoClient, Db } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Support high payload limit for photo and image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Persistent Data Directory (Local file fallback)
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Serve uploaded images statically
app.use('/api/uploads', express.static(UPLOADS_DIR));

// MongoDB Client & State
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let mongoConnected = false;
let mongoError: string | null = null;

async function connectToMongo(uri: string) {
  try {
    console.log('[MongoDB] Connecting to MongoDB...');
    mongoClient = new MongoClient(uri, {
      connectTimeoutMS: 8000,
      serverSelectionTimeoutMS: 8000,
    });
    await mongoClient.connect();
    const dbName = process.env.MONGODB_DB_NAME || 'fysiodanmark';
    mongoDb = mongoClient.db(dbName);
    mongoConnected = true;
    mongoError = null;
    console.log(`[MongoDB] Successfully connected to database: ${mongoDb.databaseName}`);

    // Check if MongoDB collections are empty, and seed from local db.json if needed
    try {
      const exerciseCount = await mongoDb.collection('exercises').countDocuments();
      if (exerciseCount === 0) {
        console.log('[MongoDB] Initializing collections with local starter data...');
        const local = readLocalDB();
        if (local.exercises && local.exercises.length > 0) {
          await mongoDb.collection('exercises').insertMany(local.exercises);
        }
        if (local.plans && local.plans.length > 0) {
          await mongoDb.collection('plans').insertMany(local.plans);
        }
        if (local.logs && local.logs.length > 0) {
          await mongoDb.collection('logs').insertMany(local.logs);
        }
        console.log('[MongoDB] Starter data seeded successfully!');
      }
    } catch (seedErr) {
      console.warn('[MongoDB] Seeding check error:', seedErr);
    }
  } catch (err: any) {
    mongoConnected = false;
    const errStr = `${err?.message || ''} ${err?.cause?.message || ''} ${String(err)}`;
    if (errStr.includes('tlsv1 alert internal error') || errStr.includes('SSL alert number 80')) {
      mongoError = 'IP_NOT_WHITELISTED';
    } else {
      mongoError = err.message || 'Connection failed';
    }
    console.warn('[MongoDB] Connection error, using local fallback:', err.message);
  }
}

// Initialize MongoDB if MONGODB_URI is provided
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  connectToMongo(MONGODB_URI);
} else {
  console.log('[Database] No MONGODB_URI provided. Running on persistent local storage (data/db.json).');
}

interface DBData {
  exercises: any[];
  plans: any[];
  logs: any[];
  sessions: any[];
  draft?: any;
}

function readLocalDB(): DBData {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading db.json, returning empty defaults', err);
  }
  return { exercises: [], plans: [], logs: [], sessions: [], draft: null };
}

function writeLocalDB(data: DBData): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing db.json', err);
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoConnected ? 'mongodb' : 'local_json',
    mongoConnected,
    serverTime: new Date().toISOString(),
  });
});

app.get('/api/db-status', (req, res) => {
  res.json({
    type: mongoConnected ? 'mongodb' : 'local_json',
    connected: mongoConnected,
    databaseName: mongoDb?.databaseName || 'Local File (db.json)',
    hasMongoUri: Boolean(process.env.MONGODB_URI),
    error: mongoError,
  });
});

app.post('/api/db-retry', async (req, res) => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    return res.status(400).json({ success: false, error: 'No MONGODB_URI configured' });
  }
  await connectToMongo(uri);
  res.json({
    success: mongoConnected,
    connected: mongoConnected,
    databaseName: mongoDb?.databaseName || 'Local File (db.json)',
    error: mongoError,
  });
});

// Seed / check initial data
app.get('/api/db-state', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      const [exercises, plans, logs, sessions] = await Promise.all([
        mongoDb.collection('exercises').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection('plans').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection('logs').find({}, { projection: { _id: 0 } }).toArray(),
        mongoDb.collection('sessions').find({}, { projection: { _id: 0 } }).toArray(),
      ]);
      return res.json({ exercises, plans, logs, sessions });
    } catch (err) {
      console.warn('MongoDB read error, falling back to local file', err);
    }
  }

  const db = readLocalDB();
  res.json(db);
});

// Initial bulk seed or sync
app.post('/api/sync', async (req, res) => {
  const { exercises, plans, logs, sessions } = req.body;

  if (mongoConnected && mongoDb) {
    try {
      if (exercises && exercises.length > 0) {
        for (const ex of exercises) {
          const { _id, ...cleanEx } = ex;
          await mongoDb.collection('exercises').updateOne({ id: cleanEx.id }, { $set: cleanEx }, { upsert: true });
        }
      }
      if (plans && plans.length > 0) {
        for (const plan of plans) {
          const { _id, ...cleanPlan } = plan;
          await mongoDb.collection('plans').updateOne({ id: cleanPlan.id }, { $set: cleanPlan }, { upsert: true });
        }
      }
      if (logs && logs.length > 0) {
        for (const log of logs) {
          const { _id, ...cleanLog } = log;
          await mongoDb.collection('logs').updateOne({ id: cleanLog.id }, { $set: cleanLog }, { upsert: true });
        }
      }
      return res.json({ success: true, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB sync error, falling back to local file', err);
    }
  }

  const current = readLocalDB();
  const merged: DBData = {
    exercises: exercises && exercises.length > 0 ? exercises : current.exercises,
    plans: plans && plans.length > 0 ? plans : current.plans,
    logs: logs || current.logs,
    sessions: sessions || current.sessions,
  };

  writeLocalDB(merged);
  res.json({ success: true, db: merged, mode: 'local' });
});

// Exercises
app.get('/api/exercises', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      const exercises = await mongoDb.collection('exercises').find({}, { projection: { _id: 0 } }).toArray();
      return res.json(exercises);
    } catch (err) {
      console.warn('MongoDB error fetching exercises', err);
    }
  }

  const db = readLocalDB();
  res.json(db.exercises || []);
});

app.post('/api/exercises', async (req, res) => {
  const exercise = req.body;
  if (!exercise || !exercise.id) {
    return res.status(400).json({ error: 'Exercise and id are required' });
  }

  if (mongoConnected && mongoDb) {
    try {
      const { _id, ...cleanExercise } = exercise;
      await mongoDb.collection('exercises').updateOne({ id: cleanExercise.id }, { $set: cleanExercise }, { upsert: true });
      return res.json({ success: true, exercise: cleanExercise, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error saving exercise', err);
    }
  }

  const db = readLocalDB();
  const existingIdx = db.exercises.findIndex((e: any) => e.id === exercise.id);
  if (existingIdx >= 0) {
    db.exercises[existingIdx] = exercise;
  } else {
    db.exercises.unshift(exercise);
  }
  writeLocalDB(db);
  res.json({ success: true, exercise, mode: 'local' });
});

app.delete('/api/exercises/:id', async (req, res) => {
  const { id } = req.params;

  if (mongoConnected && mongoDb) {
    try {
      await mongoDb.collection('exercises').deleteOne({ id });
      return res.json({ success: true, id, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error deleting exercise', err);
    }
  }

  const db = readLocalDB();
  db.exercises = db.exercises.filter((e: any) => e.id !== id);
  writeLocalDB(db);
  res.json({ success: true, id, mode: 'local' });
});

// Plans
app.get('/api/plans', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      const plans = await mongoDb.collection('plans').find({}, { projection: { _id: 0 } }).toArray();
      return res.json(plans);
    } catch (err) {
      console.warn('MongoDB error fetching plans', err);
    }
  }

  const db = readLocalDB();
  res.json(db.plans || []);
});

app.post('/api/plans', async (req, res) => {
  const plan = req.body;
  if (!plan || !plan.id) {
    return res.status(400).json({ error: 'Plan and id are required' });
  }

  if (mongoConnected && mongoDb) {
    try {
      const { _id, ...cleanPlan } = plan;
      await mongoDb.collection('plans').updateOne({ id: cleanPlan.id }, { $set: cleanPlan }, { upsert: true });
      return res.json({ success: true, plan: cleanPlan, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error saving plan', err);
    }
  }

  const db = readLocalDB();
  const existingIdx = db.plans.findIndex((p: any) => p.id === plan.id);
  if (existingIdx >= 0) {
    db.plans[existingIdx] = plan;
  } else {
    db.plans.push(plan);
  }
  writeLocalDB(db);
  res.json({ success: true, plan, mode: 'local' });
});

app.delete('/api/plans/:id', async (req, res) => {
  const { id } = req.params;

  if (mongoConnected && mongoDb) {
    try {
      await mongoDb.collection('plans').deleteOne({ id });
      return res.json({ success: true, id, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error deleting plan', err);
    }
  }

  const db = readLocalDB();
  db.plans = db.plans.filter((p: any) => p.id !== id);
  writeLocalDB(db);
  res.json({ success: true, id, mode: 'local' });
});

// Logs
app.get('/api/logs', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      const logs = await mongoDb.collection('logs').find({}, { projection: { _id: 0 } }).sort({ timestamp: -1 }).toArray();
      return res.json(logs);
    } catch (err) {
      console.warn('MongoDB error fetching logs', err);
    }
  }

  const db = readLocalDB();
  res.json(db.logs || []);
});

app.post('/api/logs', async (req, res) => {
  const entry = req.body;

  if (mongoConnected && mongoDb) {
    try {
      const { _id, ...cleanEntry } = entry;
      await mongoDb.collection('logs').updateOne({ id: cleanEntry.id }, { $set: cleanEntry }, { upsert: true });
      return res.json({ success: true, entry: cleanEntry, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error saving log', err);
    }
  }

  const db = readLocalDB();
  db.logs.unshift(entry);
  writeLocalDB(db);
  res.json({ success: true, entry, mode: 'local' });
});

// Sessions
app.get('/api/sessions', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      const sessions = await mongoDb.collection('sessions').find({}, { projection: { _id: 0 } }).sort({ completedAt: -1 }).toArray();
      return res.json(sessions);
    } catch (err) {
      console.warn('MongoDB error fetching sessions', err);
    }
  }

  const db = readLocalDB();
  res.json(db.sessions || []);
});

app.post('/api/sessions', async (req, res) => {
  const session = req.body;

  if (mongoConnected && mongoDb) {
    try {
      const { _id, ...cleanSession } = session;
      await mongoDb.collection('sessions').updateOne({ id: cleanSession.id }, { $set: cleanSession }, { upsert: true });
      if (cleanSession.entries && Array.isArray(cleanSession.entries)) {
        for (const entry of cleanSession.entries) {
          const { _id: entryId, ...cleanEntry } = entry;
          await mongoDb.collection('logs').updateOne({ id: cleanEntry.id }, { $set: cleanEntry }, { upsert: true });
        }
      }
      return res.json({ success: true, session: cleanSession, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error saving session', err);
    }
  }

  const db = readLocalDB();
  db.sessions.unshift(session);
  if (session.entries && Array.isArray(session.entries)) {
    db.logs.unshift(...session.entries);
  }
  writeLocalDB(db);
  res.json({ success: true, session, mode: 'local' });
});

app.delete('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;

  if (mongoConnected && mongoDb) {
    try {
      await mongoDb.collection('sessions').deleteOne({ id });
      return res.json({ success: true, id, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error deleting session', err);
    }
  }

  const db = readLocalDB();
  db.sessions = (db.sessions || []).filter((s: any) => s.id !== id);
  writeLocalDB(db);
  res.json({ success: true, id, mode: 'local' });
});

// Active workout draft endpoints (allows resuming unfinished workouts)
app.get('/api/active-draft', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      const draft = await mongoDb.collection('drafts').findOne({ type: 'active_workout' }, { projection: { _id: 0 } });
      if (draft) {
        return res.json({ draft: draft.data });
      }
    } catch (err) {
      console.warn('MongoDB error fetching active draft', err);
    }
  }

  const db = readLocalDB();
  res.json({ draft: db.draft || null });
});

app.post('/api/active-draft', async (req, res) => {
  const { draft } = req.body;

  if (mongoConnected && mongoDb) {
    try {
      if (draft) {
        await mongoDb.collection('drafts').updateOne(
          { type: 'active_workout' },
          { $set: { type: 'active_workout', data: draft, updatedAt: new Date().toISOString() } },
          { upsert: true }
        );
      } else {
        await mongoDb.collection('drafts').deleteOne({ type: 'active_workout' });
      }
      return res.json({ success: true, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error saving draft', err);
    }
  }

  const db = readLocalDB();
  db.draft = draft || null;
  writeLocalDB(db);
  res.json({ success: true, mode: 'local' });
});

app.delete('/api/active-draft', async (req, res) => {
  if (mongoConnected && mongoDb) {
    try {
      await mongoDb.collection('drafts').deleteOne({ type: 'active_workout' });
      return res.json({ success: true, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB error deleting draft', err);
    }
  }

  const db = readLocalDB();
  db.draft = null;
  writeLocalDB(db);
  res.json({ success: true, mode: 'local' });
});

// Direct Image Upload Endpoint
app.post('/api/upload-image', (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // If it's a data URL, decode and write to disk
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      const mimeType = matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const ext = mimeType.split('/')[1] || 'png';
      const cleanFilename = `img_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, cleanFilename);
      fs.writeFileSync(filePath, buffer);
      const publicUrl = `/api/uploads/${cleanFilename}`;
      return res.json({ success: true, url: publicUrl });
    }

    // If raw base64 or URL already
    return res.json({ success: true, url: imageBase64 });
  } catch (err: any) {
    console.error('Image upload failed', err);
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
});

// Reset endpoint
app.post('/api/reset', async (req, res) => {
  const { exercises, plans, logs } = req.body;

  if (mongoConnected && mongoDb) {
    try {
      await Promise.all([
        mongoDb.collection('exercises').deleteMany({}),
        mongoDb.collection('plans').deleteMany({}),
        mongoDb.collection('logs').deleteMany({}),
        mongoDb.collection('sessions').deleteMany({}),
      ]);
      if (exercises && exercises.length) await mongoDb.collection('exercises').insertMany(exercises);
      if (plans && plans.length) await mongoDb.collection('plans').insertMany(plans);
      if (logs && logs.length) await mongoDb.collection('logs').insertMany(logs);
      return res.json({ success: true, mode: 'mongodb' });
    } catch (err) {
      console.warn('MongoDB reset error', err);
    }
  }

  const resetDb: DBData = {
    exercises: exercises || [],
    plans: plans || [],
    logs: logs || [],
    sessions: [],
  };
  writeLocalDB(resetDb);
  res.json({ success: true, db: resetDb, mode: 'local' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FysioDanmark Træningssystem running on http://localhost:${PORT}`);
  });
}

startServer();
