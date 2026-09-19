import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Support high payload limit for photo and image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Persistent Data Directory
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

interface DBData {
  exercises: any[];
  plans: any[];
  logs: any[];
  sessions: any[];
}

function readDB(): DBData {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading db.json, returning empty defaults', err);
  }
  return { exercises: [], plans: [], logs: [], sessions: [] };
}

function writeDB(data: DBData): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing db.json', err);
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

// Seed / check initial data
app.get('/api/db-state', (req, res) => {
  const db = readDB();
  res.json(db);
});

// Initial bulk seed or sync
app.post('/api/sync', (req, res) => {
  const { exercises, plans, logs, sessions } = req.body;
  const current = readDB();

  const merged: DBData = {
    exercises: (exercises && exercises.length > 0) ? exercises : current.exercises,
    plans: (plans && plans.length > 0) ? plans : current.plans,
    logs: logs || current.logs,
    sessions: sessions || current.sessions,
  };

  writeDB(merged);
  res.json({ success: true, db: merged });
});

// Exercises
app.get('/api/exercises', (req, res) => {
  const db = readDB();
  res.json(db.exercises || []);
});

app.post('/api/exercises', (req, res) => {
  const exercise = req.body;
  if (!exercise || !exercise.id) {
    return res.status(400).json({ error: 'Exercise and id are required' });
  }

  const db = readDB();
  const existingIdx = db.exercises.findIndex((e: any) => e.id === exercise.id);
  if (existingIdx >= 0) {
    db.exercises[existingIdx] = exercise;
  } else {
    db.exercises.unshift(exercise);
  }
  writeDB(db);
  res.json({ success: true, exercise });
});

app.delete('/api/exercises/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  db.exercises = db.exercises.filter((e: any) => e.id !== id);
  writeDB(db);
  res.json({ success: true, id });
});

// Plans
app.get('/api/plans', (req, res) => {
  const db = readDB();
  res.json(db.plans || []);
});

app.post('/api/plans', (req, res) => {
  const plan = req.body;
  if (!plan || !plan.id) {
    return res.status(400).json({ error: 'Plan and id are required' });
  }

  const db = readDB();
  const existingIdx = db.plans.findIndex((p: any) => p.id === plan.id);
  if (existingIdx >= 0) {
    db.plans[existingIdx] = plan;
  } else {
    db.plans.push(plan);
  }
  writeDB(db);
  res.json({ success: true, plan });
});

app.delete('/api/plans/:id', (req, res) => {
  const { id } = req.params;
  const db = readDB();
  db.plans = db.plans.filter((p: any) => p.id !== id);
  writeDB(db);
  res.json({ success: true, id });
});

// Logs
app.get('/api/logs', (req, res) => {
  const db = readDB();
  res.json(db.logs || []);
});

app.post('/api/logs', (req, res) => {
  const entry = req.body;
  const db = readDB();
  db.logs.unshift(entry);
  writeDB(db);
  res.json({ success: true, entry });
});

// Sessions
app.get('/api/sessions', (req, res) => {
  const db = readDB();
  res.json(db.sessions || []);
});

app.post('/api/sessions', (req, res) => {
  const session = req.body;
  const db = readDB();
  db.sessions.unshift(session);
  if (session.entries && Array.isArray(session.entries)) {
    db.logs.unshift(...session.entries);
  }
  writeDB(db);
  res.json({ success: true, session });
});

// Direct Image Upload Endpoint
app.post('/api/upload-image', (req, res) => {
  try {
    const { imageBase64, filename } = req.body;
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
app.post('/api/reset', (req, res) => {
  const { exercises, plans, logs } = req.body;
  const resetDb: DBData = {
    exercises: exercises || [],
    plans: plans || [],
    logs: logs || [],
    sessions: [],
  };
  writeDB(resetDb);
  res.json({ success: true, db: resetDb });
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
