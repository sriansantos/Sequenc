require('dotenv').config();
const path = require('path');
const express = require('express');
const store = require('./store');
const { GROUPS } = require('./seed');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// Manifest com content-type correto (garantia extra para iOS)
app.get('/manifest.webmanifest', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.webmanifest'));
});

app.use(express.static(path.join(__dirname, 'public')));

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

// ---------- Helpers de validação ----------
function clampNum(v, min, max) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = 0;
  n = Math.round(n * 100) / 100;
  return Math.min(max, Math.max(min, n));
}

function clampInt(v, min, max) {
  let n = Number(v);
  if (!Number.isFinite(n)) n = 0;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function sanitizeExercise(body) {
  return {
    name: String(body?.name ?? '').trim().slice(0, 60),
    group: GROUPS.includes(body?.group) ? body.group : 'Outros',
    gymId: String(body?.gymId ?? '').slice(0, 64),
  };
}

// Resolve a academia do exercício (ou a primeira, como padrão)
async function resolveGymId(gymId) {
  const gyms = await store.listGyms();
  return gyms.find((g) => g.id === gymId) ? gymId : (gyms[0]?.id ?? '');
}

async function sanitizeWorkout(body) {
  const title = String(body?.title ?? '').trim().slice(0, 60);
  const dateRaw = body?.date ? new Date(body.date) : new Date();
  const date = isNaN(dateRaw.getTime()) ? new Date() : dateRaw;

  const gymId = String(body?.gymId ?? '').slice(0, 64);
  const gym = gymId ? await store.getGym(gymId) : null;
  const gymName = gym
    ? gym.name
    : String(body?.gymName ?? '').trim().slice(0, 40);

  const rawItems = Array.isArray(body?.items) ? body.items.slice(0, 30) : [];
  const items = rawItems
    .map((it) => ({
      exerciseId: String(it?.exerciseId ?? '').slice(0, 64),
      name: String(it?.name ?? '').trim().slice(0, 60) || 'Exercício',
      group: GROUPS.includes(it?.group) ? it.group : 'Outros',
      sets: (Array.isArray(it?.sets) ? it.sets : []).slice(0, 20)
        .map((s) => ({ weight: clampNum(s?.weight, 0, 1000), reps: clampInt(s?.reps, 0, 500) }))
        .filter((s) => s.weight > 0 || s.reps > 0),
    }))
    .filter((it) => it.sets.length > 0);

  const volume = items.reduce((t, it) => t + it.sets.reduce((s, x) => s + x.weight * x.reps, 0), 0);
  return { title, date, gymId, gymName, items, volume };
}

// ---------- Rotas: academias ----------
app.get('/api/gyms', wrap(async (req, res) => {
  res.json(await store.listGyms());
}));

app.post('/api/gyms', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  if (!name) return bad(res, 'Informe o nome da academia.');
  const dup = await store.findGymByName(name);
  if (dup) return bad(res, 'Já existe uma academia com esse nome.', 409);
  res.status(201).json(await store.createGym({ name }));
}));

app.put('/api/gyms/:id', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  if (!name) return bad(res, 'Informe o nome da academia.');
  const dup = await store.findGymByName(name);
  if (dup && dup.id !== req.params.id && dup._id !== req.params.id) {
    return bad(res, 'Já existe uma academia com esse nome.', 409);
  }
  const updated = await store.updateGym(req.params.id, { name });
  if (!updated) return bad(res, 'Academia não encontrada.', 404);
  res.json(updated);
}));

app.delete('/api/gyms/:id', wrap(async (req, res) => {
  const out = await store.deleteGym(req.params.id);
  if (!out) {
    return bad(res, 'Você precisa ter pelo menos uma academia. Cadastre outra antes de excluir esta.');
  }
  res.json({ ok: true, movedTo: out.movedTo });
}));

// ---------- Rotas: exercícios ----------
app.get('/api/exercises', wrap(async (req, res) => {
  res.json(await store.listExercises());
}));

app.post('/api/exercises', wrap(async (req, res) => {
  const { name, group } = sanitizeExercise(req.body);
  if (!name) return bad(res, 'Informe o nome do exercício.');
  const gymId = await resolveGymId(sanitizeExercise(req.body).gymId);
  const dup = await store.findExerciseByName(name, gymId);
  if (dup) return bad(res, 'Já existe um exercício com esse nome nesta academia.', 409);
  res.status(201).json(await store.createExercise({ name, group, gymId }));
}));

app.put('/api/exercises/:id', wrap(async (req, res) => {
  const { name, group } = sanitizeExercise(req.body);
  if (!name) return bad(res, 'Informe o nome do exercício.');
  const gymId = await resolveGymId(sanitizeExercise(req.body).gymId);
  const dup = await store.findExerciseByName(name, gymId);
  if (dup && dup.id !== req.params.id && dup._id !== req.params.id) {
    return bad(res, 'Já existe um exercício com esse nome nesta academia.', 409);
  }
  const updated = await store.updateExercise(req.params.id, { name, group, gymId });
  if (!updated) return bad(res, 'Exercício não encontrado.', 404);
  res.json(updated);
}));

app.delete('/api/exercises/:id', wrap(async (req, res) => {
  const ok = await store.deleteExercise(req.params.id);
  if (!ok) return bad(res, 'Exercício não encontrado.', 404);
  res.json({ ok: true });
}));

// ---------- Rotas: treinos ----------
app.get('/api/workouts', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 100);
  res.json(await store.listWorkouts(limit));
}));

app.post('/api/workouts', wrap(async (req, res) => {
  const data = await sanitizeWorkout(req.body);
  if (data.items.length === 0) return bad(res, 'Adicione pelo menos um exercício com séries antes de finalizar.');
  res.status(201).json(await store.createWorkout(data));
}));

app.delete('/api/workouts/:id', wrap(async (req, res) => {
  const ok = await store.deleteWorkout(req.params.id);
  if (!ok) return bad(res, 'Treino não encontrado.', 404);
  res.json({ ok: true });
}));

app.get('/api/health', wrap(async (req, res) => {
  res.json({ ok: true, db: store.mode, time: new Date().toISOString() });
}));

// API desconhecida
app.use('/api', (req, res) => bad(res, 'Rota não encontrada.', 404));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await store.init(process.env.MONGODB_URI);
  } catch (err) {
    console.error('Falha ao conectar no MongoDB:', err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`🏋️  Sequenc rodando em http://localhost:${PORT} (db: ${store.mode})`);
  });
})();
