require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./store');
const { GROUPS, SEED_EXERCISES } = require('./seed');

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

// ---------- Autenticação ----------
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function tokenFromReq(req) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// Exige sessão válida e anexa req.userId
async function auth(req, res, next) {
  const token = tokenFromReq(req);
  const session = await store.findSession(token);
  if (!session) return bad(res, 'Faça login para continuar.', 401);
  req.userId = session.userId;
  req.token = token;
  next();
}

// ---------- Rotas: entrar / criar conta ----------
app.post('/api/auth/register', wrap(async (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase().slice(0, 30);
  const password = String(req.body?.password ?? '');
  if (username.length < 3) return bad(res, 'O usuário precisa ter pelo menos 3 caracteres.');
  if (!/^[a-z0-9._-]+$/.test(username)) return bad(res, 'O usuário pode ter letras, números, ponto, hífen e underline.');
  if (password.length < 4) return bad(res, 'A senha precisa ter pelo menos 4 caracteres.');
  if (await store.findUserByUsername(username)) return bad(res, 'Esse usuário já existe. Escolha outro.', 409);

  const salt = crypto.randomBytes(16).toString('hex');
  const user = await store.createUser({ username, salt, passHash: hashPassword(password, salt) });
  const gym = await store.createGym({ name: 'Academia', userId: user.id });
  await store.seedExercises(SEED_EXERCISES, gym.id, user.id);
  const token = crypto.randomBytes(24).toString('hex');
  await store.createSession({ token, userId: user.id });
  res.status(201).json({ token, username });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const user = await store.findUserByUsername(username);
  if (!user) return bad(res, 'Usuário ou senha incorretos.', 401);
  const hash = hashPassword(password, user.salt);
  const ok = hash.length === user.passHash.length &&
    crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.passHash));
  if (!ok) return bad(res, 'Usuário ou senha incorretos.', 401);
  const token = crypto.randomBytes(24).toString('hex');
  await store.createSession({ token, userId: user.id });
  res.json({ token, username: user.username });
}));

app.get('/api/auth/me', auth, wrap(async (req, res) => {
  const user = await store.findUserById(req.userId);
  res.json({ username: user?.username ?? '' });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  await store.deleteSession(tokenFromReq(req));
  res.json({ ok: true });
}));

// ---------- Rotas protegidas ----------
app.use('/api/gyms', auth);
app.use('/api/exercises', auth);
app.use('/api/workouts', auth);

// ---------- Rotas: academias ----------
app.get('/api/gyms', wrap(async (req, res) => {
  res.json(await store.listGyms(req.userId));
}));

app.post('/api/gyms', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  if (!name) return bad(res, 'Informe o nome da academia.');
  const dup = await store.findGymByName(name, req.userId);
  if (dup) return bad(res, 'Já existe uma academia com esse nome.', 409);
  const gym = await store.createGym({ name, userId: req.userId });
  if (req.body?.seed) await store.seedExercises(SEED_EXERCISES, gym.id, req.userId);
  res.status(201).json(gym);
}));

app.put('/api/gyms/:id', wrap(async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 40);
  if (!name) return bad(res, 'Informe o nome da academia.');
  const dup = await store.findGymByName(name, req.userId);
  if (dup && dup.id !== req.params.id && dup._id !== req.params.id) {
    return bad(res, 'Já existe uma academia com esse nome.', 409);
  }
  const updated = await store.updateGym(req.params.id, req.userId, { name });
  if (!updated) return bad(res, 'Academia não encontrada.', 404);
  res.json(updated);
}));

app.delete('/api/gyms/:id', wrap(async (req, res) => {
  const out = await store.deleteGym(req.params.id, req.userId);
  if (!out) {
    return bad(res, 'Você precisa ter pelo menos uma academia. Cadastre outra antes de excluir esta.');
  }
  res.json({ ok: true, movedTo: out.movedTo });
}));

// ---------- Rotas: exercícios ----------
function sanitizeExercise(body) {
  return {
    name: String(body?.name ?? '').trim().slice(0, 60),
    group: GROUPS.includes(body?.group) ? body.group : 'Outros',
    gymId: String(body?.gymId ?? '').slice(0, 64),
  };
}

// Resolve a academia do exercício (ou a primeira do usuário, como padrão)
async function resolveGymId(gymId, userId) {
  const gyms = await store.listGyms(userId);
  return gyms.find((g) => g.id === gymId || g._id === gymId) ? gymId : (gyms[0]?.id ?? gyms[0]?._id ?? '');
}

app.get('/api/exercises', wrap(async (req, res) => {
  res.json(await store.listExercises(req.userId));
}));

app.post('/api/exercises', wrap(async (req, res) => {
  const { name, group } = sanitizeExercise(req.body);
  if (!name) return bad(res, 'Informe o nome do exercício.');
  const gymId = await resolveGymId(sanitizeExercise(req.body).gymId, req.userId);
  const dup = await store.findExerciseByName(name, gymId, req.userId);
  if (dup) return bad(res, 'Já existe um exercício com esse nome nesta academia.', 409);
  res.status(201).json(await store.createExercise({ name, group, gymId, userId: req.userId }));
}));

app.put('/api/exercises/:id', wrap(async (req, res) => {
  const { name, group } = sanitizeExercise(req.body);
  if (!name) return bad(res, 'Informe o nome do exercício.');
  const gymId = await resolveGymId(sanitizeExercise(req.body).gymId, req.userId);
  const dup = await store.findExerciseByName(name, gymId, req.userId);
  const dupId = dup ? (dup.id ?? dup._id?.toString()) : null;
  if (dup && dupId !== req.params.id) {
    return bad(res, 'Já existe um exercício com esse nome nesta academia.', 409);
  }
  const updated = await store.updateExercise(req.params.id, req.userId, { name, group, gymId });
  if (!updated) return bad(res, 'Exercício não encontrado.', 404);
  res.json(updated);
}));

app.delete('/api/exercises/:id', wrap(async (req, res) => {
  const ok = await store.deleteExercise(req.params.id, req.userId);
  if (!ok) return bad(res, 'Exercício não encontrado.', 404);
  res.json({ ok: true });
}));

// ---------- Rotas: treinos ----------
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

async function sanitizeWorkout(body, userId) {
  const title = String(body?.title ?? '').trim().slice(0, 60);
  const dateRaw = body?.date ? new Date(body.date) : new Date();
  const date = isNaN(dateRaw.getTime()) ? new Date() : dateRaw;

  const gymId = String(body?.gymId ?? '').slice(0, 64);
  const gym = gymId ? await store.getGym(gymId, userId) : null;
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
  return { title, date, gymId, gymName, items, volume, userId };
}

app.get('/api/workouts', wrap(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 100);
  res.json(await store.listWorkouts(req.userId, limit));
}));

app.post('/api/workouts', wrap(async (req, res) => {
  const data = await sanitizeWorkout(req.body, req.userId);
  if (data.items.length === 0) return bad(res, 'Adicione pelo menos um exercício com séries antes de finalizar.');
  res.status(201).json(await store.createWorkout(data));
}));

app.delete('/api/workouts/:id', wrap(async (req, res) => {
  const ok = await store.deleteWorkout(req.params.id, req.userId);
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
