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

function normalizeKey(value: unknown): string {
  return String(value || '')
    .toLocaleLowerCase('da-DK')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function stablePlanKeyForDraft(draft: any): string {
  return draft?.stablePlanKey || normalizeKey(draft?.planTitle) || String(draft?.planId || 'unknown-plan');
}

function draftCompletedCount(draft: any): number {
  return Array.isArray(draft?.exercises) ? draft.exercises.filter((e: any) => Boolean(e?.isCompleted)).length : 0;
}

function draftActivityScore(draft: any): number {
  if (!draft) return 0;
  const exercises = Array.isArray(draft.exercises) ? draft.exercises : [];
  const completed = draftCompletedCount(draft);
  const notes = exercises.filter((e: any) => String(e?.notes || '').trim().length > 0).length;
  const scoreResults = exercises.reduce((sum: number, e: any) => sum + (Array.isArray(e?.scoreResults) ? e.scoreResults.length : 0), 0);
  const exerciseTimerSeconds = exercises.reduce((sum: number, e: any) => sum + Number(e?.activeTimerSeconds || 0), 0);
  const timers = draft?.timers && typeof draft.timers === 'object'
    ? Object.values(draft.timers as Record<string, any>).reduce((sum: number, timer: any) => sum + Number(timer?.seconds || 0), 0)
    : 0;
  return completed * 100000 + notes * 1000 + scoreResults * 100 + Number(draft.sessionSeconds || 0) + exerciseTimerSeconds + timers;
}

function normalizeWorkoutDraft(rawDraft: any, fallbackUpdatedAt?: unknown) {
  const draft = rawDraft || {};
  const stablePlanKey = stablePlanKeyForDraft(draft);
  const aliases = Array.from(new Set([
    ...(Array.isArray(draft.planIdAliases) ? draft.planIdAliases : []),
    draft.planId,
  ].filter(Boolean).map(String)));
  return {
    ...draft,
    id: draft.id || `draft-${draft.planId || stablePlanKey}`,
    stablePlanKey,
    planIdAliases: aliases,
    lastUpdated: draft.lastUpdated || String(fallbackUpdatedAt || new Date().toISOString()),
  };
}

async function migrateLegacyWorkoutDrafts(db: Db): Promise<void> {
  const legacyDocs: any[] = await db.collection('drafts')
    .find({ type: 'active_workout' })
    .toArray();

  for (const legacyDoc of legacyDocs) {
    if (!legacyDoc?.data?.planId && !legacyDoc?.data?.planTitle) continue;

    const legacy = normalizeWorkoutDraft(legacyDoc.data, legacyDoc.updatedAt);
    const existing: any = await db.collection('drafts').findOne({
      type: 'workout_draft',
      $or: [
        { planId: legacy.planId },
        { 'data.planId': legacy.planId },
        { 'data.planIdAliases': legacy.planId },
        { stablePlanKey: legacy.stablePlanKey },
        { 'data.stablePlanKey': legacy.stablePlanKey },
      ],
    });

    let chosen = legacy;
    if (existing?.data) {
      const current = normalizeWorkoutDraft(existing.data, existing.updatedAt);
      // Prefer the draft with the most actual workout progress. This specifically protects
      // historical drafts such as 9/12 from being replaced by a newly-created 0/12 shell.
      if (draftActivityScore(current) > draftActivityScore(legacy)) chosen = current;
      chosen = normalizeWorkoutDraft({
        ...chosen,
        id: current.id || chosen.id,
        planId: current.planId || chosen.planId,
        planTitle: current.planTitle || chosen.planTitle,
        planIdAliases: Array.from(new Set([...(current.planIdAliases || []), ...(legacy.planIdAliases || []), current.planId, legacy.planId].filter(Boolean))),
      });
    }

    await db.collection('drafts').updateOne(
      existing?._id ? { _id: existing._id } : { type: 'workout_draft', 'data.id': chosen.id },
      { $set: { type: 'workout_draft', planId: chosen.planId, stablePlanKey: chosen.stablePlanKey, data: chosen, updatedAt: chosen.lastUpdated } },
      { upsert: !existing?._id },
    );

    await db.collection('drafts').deleteOne({ _id: legacyDoc._id });
  }
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

  if (path === '/api/migrations/cleanup-orphan-logs' && method === 'POST') {
    const sessions: any[] = await db.collection('sessions').find({}, { projection: { entries: 1 } }).toArray();
    const referencedIds = new Set<string>();
    for (const session of sessions) {
      if (!Array.isArray(session?.entries)) continue;
      for (const entry of session.entries) {
        if (entry?.id) referencedIds.add(String(entry.id));
      }
    }

    const filter = referencedIds.size
      ? { id: { $nin: Array.from(referencedIds) } }
      : { id: { $exists: true } };
    const result = await db.collection('logs').deleteMany(filter as any);
    return json({ success: true, deleted: result.deletedCount, referenced: referencedIds.size });
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

    // Keep copied exercise metadata in plans and active drafts in sync with the library.
    // This means changing e.g. the title in the exercise library is reflected everywhere.
    const sharedFields: Record<string, any> = {
      name: exercise.name,
      description: exercise.description,
      imageUrl: exercise.imageUrl ?? null,
      imagePosition: exercise.imagePosition ?? null,
      videoUrl: exercise.videoUrl ?? null,
      targetArea: exercise.targetArea ?? null,
      categories: Array.isArray(exercise.categories) ? exercise.categories : undefined,
      trackingMode: exercise.trackingMode ?? 'sets_reps_weight',
      durationSeconds: exercise.defaultDurationSeconds ?? null,
      rounds: exercise.defaultRounds ?? null,
      restSeconds: exercise.restSeconds ?? null,
      scoreLabel: exercise.scoreLabel ?? null,
      scoreUnit: exercise.scoreUnit ?? null,
      lowerScoreIsBetter: exercise.lowerScoreIsBetter ?? null,
      scorePerSide: exercise.scorePerSide ?? null,
    };
    const planSet: Record<string, any> = {};
    const draftSet: Record<string, any> = {};
    for (const [key, value] of Object.entries(sharedFields)) {
      if (value === undefined) continue;
      planSet[`exercises.$[item].${key}`] = value;
      draftSet[`data.exercises.$[item].${key}`] = value;
    }
    if (Object.keys(planSet).length) {
      await db.collection('plans').updateMany(
        { 'exercises.exerciseId': exercise.id },
        { $set: planSet },
        { arrayFilters: [{ 'item.exerciseId': exercise.id }] },
      );
      await db.collection('drafts').updateMany(
        { 'data.exercises.exerciseId': exercise.id },
        { $set: draftSet, $currentDate: { updatedAt: true } },
        { arrayFilters: [{ 'item.exerciseId': exercise.id }] },
      );
    }

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
  const sessionUpdate = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionUpdate && method === 'PUT') {
    const id = decodeURIComponent(sessionUpdate[1]);
    const body = await bodyJson(request);
    if (!body || body.id !== id) return json({ error: 'Session-id matcher ikke URL' }, 400);

    const previous: any = await db.collection('sessions').findOne({ id });
    if (!previous) return json({ error: 'Træningspasset blev ikke fundet' }, 404);

    const session = clean(body);
    const oldEntryIds = new Set(Array.isArray(previous.entries) ? previous.entries.map((entry: any) => entry?.id).filter(Boolean) : []);
    const newEntryIds = new Set(Array.isArray(session.entries) ? session.entries.map((entry: any) => entry?.id).filter(Boolean) : []);
    const removedEntryIds = Array.from(oldEntryIds).filter((entryId) => !newEntryIds.has(entryId));

    await db.collection('sessions').updateOne({ id }, { $set: session });
    if (removedEntryIds.length) {
      await db.collection('logs').deleteMany({ id: { $in: removedEntryIds } });
    }
    if (Array.isArray(session.entries)) {
      for (const rawEntry of session.entries) {
        if (!rawEntry?.id) continue;
        const entry = clean(rawEntry);
        await db.collection('logs').updateOne({ id: entry.id }, { $set: entry }, { upsert: true });
      }
    }
    return json({ success: true, session, deletedLogEntries: removedEntryIds.length, mode: 'mongodb' });
  }

  const sessionDelete = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionDelete && method === 'DELETE') {
    const id = decodeURIComponent(sessionDelete[1]);
    const session: any = await db.collection('sessions').findOne({ id });
    const entryIds = Array.isArray(session?.entries)
      ? session.entries.map((entry: any) => entry?.id).filter(Boolean)
      : [];
    if (entryIds.length) {
      await db.collection('logs').deleteMany({ id: { $in: entryIds } });
    }
    await db.collection('sessions').deleteOne({ id });
    return json({ success: true, id, deletedLogEntries: entryIds.length, mode: 'mongodb' });
  }

  // Multiple independent workout drafts. Legacy single-draft documents are migrated lazily
  // the next time the app asks for drafts, so existing progress survives app upgrades.
  if (path === '/api/drafts' && method === 'GET') {
    await migrateLegacyWorkoutDrafts(db);
    const docs: any[] = await db.collection('drafts')
      .find({ type: 'workout_draft' }, { projection: { _id: 0, data: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .toArray();
    return json({ drafts: docs.map((d) => normalizeWorkoutDraft(d.data, d.updatedAt)).filter(Boolean) });
  }
  if (path === '/api/drafts' && method === 'POST') {
    await migrateLegacyWorkoutDrafts(db);
    const body = await bodyJson(request);
    const draft = body?.draft;
    if (!draft?.planId) return json({ error: 'Draft og planId er påkrævet' }, 400);
    const normalized = normalizeWorkoutDraft({ ...draft, lastUpdated: new Date().toISOString() });

    const existing: any = await db.collection('drafts').findOne({
      type: 'workout_draft',
      $or: [
        { 'data.id': normalized.id },
        { planId: normalized.planId },
        { 'data.planIdAliases': normalized.planId },
        { stablePlanKey: normalized.stablePlanKey },
        { 'data.stablePlanKey': normalized.stablePlanKey },
      ],
    });

    if (existing?.data) {
      const previous = normalizeWorkoutDraft(existing.data, existing.updatedAt);
      const previousCompleted = draftCompletedCount(previous);
      const incomingCompleted = draftCompletedCount(normalized);
      // An untouched freshly-opened plan must never wipe a real in-progress workout.
      // Starting over is still possible because the UI explicitly deletes the old draft first.
      if (previousCompleted > 0 && incomingCompleted === 0 && !body?.allowProgressReset) {
        return json({ success: true, draft: previous, preservedPreviousProgress: true, mode: 'mongodb' });
      }
      normalized.planIdAliases = Array.from(new Set([
        ...(previous.planIdAliases || []),
        ...(normalized.planIdAliases || []),
        previous.planId,
        normalized.planId,
      ].filter(Boolean)));
      normalized.id = previous.id || normalized.id;
    }

    await db.collection('drafts').updateOne(
      existing?._id ? { _id: existing._id } : { type: 'workout_draft', 'data.id': normalized.id },
      { $set: { type: 'workout_draft', planId: normalized.planId, stablePlanKey: normalized.stablePlanKey, data: normalized, updatedAt: normalized.lastUpdated } },
      { upsert: !existing?._id },
    );
    return json({ success: true, draft: normalized, mode: 'mongodb' });
  }
  const draftByPlan = path.match(/^\/api\/drafts\/plan\/([^/]+)$/);
  if (draftByPlan && method === 'GET') {
    await migrateLegacyWorkoutDrafts(db);
    const planId = decodeURIComponent(draftByPlan[1]);
    const title = url.searchParams.get('title') || '';
    const stablePlanKey = normalizeKey(title);
    const ors: any[] = [
      { planId },
      { 'data.planId': planId },
      { 'data.planIdAliases': planId },
    ];
    if (stablePlanKey) {
      ors.push({ stablePlanKey });
      ors.push({ 'data.stablePlanKey': stablePlanKey });
    }
    const docs: any[] = await db.collection('drafts')
      .find({ type: 'workout_draft', $or: ors })
      .sort({ updatedAt: -1 })
      .toArray();
    const best = docs
      .map((d) => normalizeWorkoutDraft(d.data, d.updatedAt))
      .sort((a, b) => draftActivityScore(b) - draftActivityScore(a))[0] || null;
    return json({ draft: best });
  }
  const draftDelete = path.match(/^\/api\/drafts\/([^/]+)$/);
  if (draftDelete && method === 'DELETE') {
    const id = decodeURIComponent(draftDelete[1]);
    const doc: any = await db.collection('drafts').findOne({ type: 'workout_draft', 'data.id': id });
    if (doc?.data) {
      const normalized = normalizeWorkoutDraft(doc.data, doc.updatedAt);
      await db.collection('drafts').deleteMany({
        type: 'workout_draft',
        $or: [
          { 'data.id': id },
          { stablePlanKey: normalized.stablePlanKey },
          { 'data.stablePlanKey': normalized.stablePlanKey },
        ],
      });
    } else {
      await db.collection('drafts').deleteOne({ type: 'workout_draft', 'data.id': id });
    }
    return json({ success: true, id, mode: 'mongodb' });
  }

  // Legacy endpoint kept for compatibility with older deployed clients.
  if (path === '/api/active-draft' && method === 'GET') {
    await migrateLegacyWorkoutDrafts(db);
    const docs: any[] = await db.collection('drafts')
      .find({ type: 'workout_draft' }, { projection: { _id: 0, data: 1, updatedAt: 1 } })
      .sort({ updatedAt: -1 })
      .toArray();
    const best = docs.map((d) => normalizeWorkoutDraft(d.data, d.updatedAt))[0] || null;
    return json({ draft: best });
  }
  if (path === '/api/active-draft' && method === 'POST') {
    await migrateLegacyWorkoutDrafts(db);
    const body = await bodyJson(request);
    const draft = body?.draft;
    if (!draft?.planId) return json({ error: 'Draft og planId er påkrævet' }, 400);
    const normalized = normalizeWorkoutDraft({ ...draft, lastUpdated: new Date().toISOString() });
    const existing: any = await db.collection('drafts').findOne({
      type: 'workout_draft',
      $or: [
        { 'data.id': normalized.id },
        { planId: normalized.planId },
        { stablePlanKey: normalized.stablePlanKey },
      ],
    });
    if (existing?.data && draftCompletedCount(existing.data) > 0 && draftCompletedCount(normalized) === 0) {
      return json({ success: true, preservedPreviousProgress: true, mode: 'mongodb' });
    }
    await db.collection('drafts').updateOne(
      existing?._id ? { _id: existing._id } : { type: 'workout_draft', 'data.id': normalized.id },
      { $set: { type: 'workout_draft', planId: normalized.planId, stablePlanKey: normalized.stablePlanKey, data: normalized, updatedAt: normalized.lastUpdated } },
      { upsert: !existing?._id },
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
