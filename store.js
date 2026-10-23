// Camada de dados com dois drivers:
//  - MongoDB (mongoose) quando MONGODB_URI está definida (produção / Render + Atlas)
//  - Em memória, quando não está (modo demo local, dados se perdem ao reiniciar)
// Todos os dados (academias, exercícios, treinos) pertencem a um usuário.
const mongoose = require('mongoose');
const crypto = require('crypto');
const { GROUPS, SEED_EXERCISES } = require('./seed');

let mode = null;

// ---------- Schemas ----------
const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passHash: { type: String, required: true },
    salt: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const sessionSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const gymSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    userId: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    group: { type: String, default: 'Outros', enum: GROUPS },
    gymId: { type: String, default: '', index: true },
    userId: { type: String, required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
exerciseSchema.index({ name: 1 });

const setSchema = new mongoose.Schema(
  { weight: { type: Number, default: 0 }, reps: { type: Number, default: 0 } },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    exerciseId: String,
    name: String,
    group: String,
    sets: [setSchema],
  },
  { _id: false }
);

const workoutSchema = new mongoose.Schema(
  {
    title: { type: String, default: '', trim: true },
    date: { type: Date, default: Date.now },
    volume: { type: Number, default: 0 },
    gymId: { type: String, default: '' },
    gymName: { type: String, default: '' },
    userId: { type: String, required: true, index: true },
    items: [itemSchema],
  },
  { versionKey: false }
);

// ---------- Driver MongoDB ----------
const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const Gym = mongoose.model('Gym', gymSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);
const Workout = mongoose.model('Workout', workoutSchema);

// IDs vindos do cliente podem estar em formato inválido (rascunhos antigos):
// consultas por _id inválido lançariam CastError; devolve "não encontrado" no lugar.
function idQuery(id) {
  return mongoose.isValidObjectId(id) ? { _id: id } : null;
}

function groupIndex(g) {
  const i = GROUPS.indexOf(g);
  return i === -1 ? GROUPS.length : i;
}

function sortExercises(list) {
  return list.slice().sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || a.name.localeCompare(b.name, 'pt-BR'));
}

const mongoStore = {
  async createUser({ username, passHash, salt }) {
    return User.create({ username, passHash, salt });
  },
  async findUserByUsername(username) {
    return User.findOne({ username: String(username).toLowerCase() }).lean();
  },
  async findUserById(id) {
    if (!id) return null;
    return User.findById(id).lean();
  },
  async createSession({ token, userId }) {
    return Session.create({ token, userId });
  },
  async findSession(token) {
    if (!token) return null;
    return Session.findOne({ token }).lean();
  },
  async deleteSession(token) {
    const out = await Session.deleteOne({ token });
    return out.deletedCount > 0;
  },

  async listGyms(userId) {
    return Gym.find({ userId }).sort({ createdAt: 1 }).lean();
  },
  async findGymByName(name, userId) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Gym.findOne({ name: new RegExp('^' + escaped + '$', 'i'), userId }).lean();
  },
  async createGym({ name, userId }) {
    return Gym.create({ name, userId });
  },
  async updateGym(id, userId, { name }) {
    const q = idQuery(id);
    if (!q) return null;
    return Gym.findOneAndUpdate({ ...q, userId }, { name }, { new: true, runValidators: true }).lean();
  },
  // Exclui a academia movendo os exercícios dela para a academia restante mais antiga do usuário.
  // Retorna null se for a última academia (não pode excluir).
  async deleteGym(id, userId) {
    const q = idQuery(id);
    if (!q) return null;
    const rest = await Gym.find({ _id: { $ne: q._id }, userId }).sort({ createdAt: 1 }).lean();
    if (!rest.length) return null;
    const target = rest[0];
    await Exercise.updateMany({ gymId: id, userId }, { $set: { gymId: String(target._id) } });
    await Gym.findOneAndDelete({ ...q, userId });
    return { movedTo: target };
  },
  async getGym(id, userId) {
    if (!id) return null;
    const q = idQuery(id);
    if (!q) return null;
    return Gym.findOne({ ...q, userId }).lean();
  },
  async firstGym(userId) {
    return Gym.findOne({ userId }).sort({ createdAt: 1 }).lean();
  },

  async listExercises(userId) {
    return sortExercises(await Exercise.find({ userId }).lean());
  },
  async findExerciseByName(name, gymId, userId) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Exercise.findOne({ name: new RegExp('^' + escaped + '$', 'i'), gymId, userId }).lean();
  },
  async createExercise({ name, group, gymId, userId }) {
    return Exercise.create({ name, group, gymId, userId });
  },
  async updateExercise(id, userId, patch) {
    const q = idQuery(id);
    if (!q) return null;
    return Exercise.findOneAndUpdate(
      { ...q, userId },
      { name: patch.name, group: patch.group, gymId: patch.gymId },
      { new: true, runValidators: true }
    ).lean();
  },
  async deleteExercise(id, userId) {
    const q = idQuery(id);
    if (!q) return false;
    const out = await Exercise.findOneAndDelete({ ...q, userId });
    return !!out;
  },

  async listWorkouts(userId, limit) {
    return Workout.find({ userId }).sort({ date: -1 }).limit(limit).lean();
  },
  async createWorkout(data) {
    return Workout.create(data);
  },
  async deleteWorkout(id, userId) {
    const q = idQuery(id);
    if (!q) return false;
    const out = await Workout.findOneAndDelete({ ...q, userId });
    return !!out;
  },
  async init() {
    // Dados são criados por usuário no cadastro; nada a migrar em instalação nova
  },
};

// ---------- Driver em memória (demo) ----------
const mem = { users: [], sessions: [], gyms: [], exercises: [], workouts: [] };
const memId = () => crypto.randomUUID();

const memStore = {
  async createUser({ username, passHash, salt }) {
    const user = { id: memId(), username: String(username).toLowerCase(), passHash, salt, createdAt: new Date() };
    mem.users.push(user);
    return user;
  },
  async findUserByUsername(username) {
    return mem.users.find((u) => u.username === String(username).toLowerCase()) || null;
  },
  async findUserById(id) {
    return mem.users.find((u) => u.id === id) || null;
  },
  async createSession({ token, userId }) {
    const s = { token, userId, createdAt: new Date() };
    mem.sessions.push(s);
    return s;
  },
  async findSession(token) {
    return mem.sessions.find((s) => s.token === token) || null;
  },
  async deleteSession(token) {
    const before = mem.sessions.length;
    mem.sessions = mem.sessions.filter((s) => s.token !== token);
    return mem.sessions.length < before;
  },

  async listGyms(userId) {
    return mem.gyms.filter((g) => g.userId === userId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  async findGymByName(name, userId) {
    return mem.gyms.find((g) => g.userId === userId && g.name.toLowerCase() === String(name).toLowerCase()) || null;
  },
  async createGym({ name, userId }) {
    const gym = { id: memId(), name, userId, createdAt: new Date() };
    mem.gyms.push(gym);
    return gym;
  },
  async updateGym(id, userId, { name }) {
    const gym = mem.gyms.find((g) => g.id === id && g.userId === userId);
    if (!gym) return null;
    gym.name = name;
    return gym;
  },
  async deleteGym(id, userId) {
    const rest = mem.gyms
      .filter((g) => g.userId === userId && g.id !== id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!rest.length) return null;
    const target = rest[0];
    for (const ex of mem.exercises) {
      if (ex.gymId === id && ex.userId === userId) ex.gymId = target.id;
    }
    mem.gyms = mem.gyms.filter((g) => !(g.id === id && g.userId === userId));
    return { movedTo: target };
  },
  async getGym(id, userId) {
    return mem.gyms.find((g) => g.id === id && g.userId === userId) || null;
  },
  async firstGym(userId) {
    return mem.gyms.filter((g) => g.userId === userId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
  },

  async listExercises(userId) {
    return sortExercises(mem.exercises.filter((e) => e.userId === userId));
  },
  async findExerciseByName(name, gymId, userId) {
    return (
      mem.exercises.find(
        (e) => e.userId === userId && e.gymId === gymId && e.name.toLowerCase() === String(name).toLowerCase()
      ) || null
    );
  },
  async createExercise({ name, group, gymId, userId }) {
    const ex = { id: memId(), name, group, gymId, userId, createdAt: new Date() };
    mem.exercises.push(ex);
    return ex;
  },
  async updateExercise(id, userId, patch) {
    const ex = mem.exercises.find((e) => e.id === id && e.userId === userId);
    if (!ex) return null;
    ex.name = patch.name;
    ex.group = patch.group;
    ex.gymId = patch.gymId;
    return ex;
  },
  async deleteExercise(id, userId) {
    const before = mem.exercises.length;
    mem.exercises = mem.exercises.filter((e) => !(e.id === id && e.userId === userId));
    return mem.exercises.length < before;
  },

  async listWorkouts(userId, limit) {
    return mem.workouts
      .filter((w) => w.userId === userId)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  },
  async createWorkout(data) {
    const w = { id: memId(), ...data };
    mem.workouts.push(w);
    return w;
  },
  async deleteWorkout(id, userId) {
    const before = mem.workouts.length;
    mem.workouts = mem.workouts.filter((w) => !(w.id === id && w.userId === userId));
    return mem.workouts.length < before;
  },
  async init() {
    // Dados são criados por usuário no cadastro
  },
};

// ---------- Inicialização / fachada ----------
async function init(uri) {
  if (uri) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    mode = 'mongo';
    console.log('✅ Conectado ao MongoDB.');
  } else {
    mode = 'memoria';
    console.warn('⚠️  MONGODB_URI não definida — MODO DEMO em memória (dados se perdem ao reiniciar).');
  }
}

const pick = (mongoFn, memFn) => (...args) => (mode === 'mongo' ? mongoFn(...args) : memFn(...args));

const store = {
  get mode() {
    return mode;
  },
  init,
  // usuários / sessões
  createUser: pick(mongoStore.createUser, memStore.createUser),
  findUserByUsername: pick(mongoStore.findUserByUsername, memStore.findUserByUsername),
  findUserById: pick(mongoStore.findUserById, memStore.findUserById),
  createSession: pick(mongoStore.createSession, memStore.createSession),
  findSession: pick(mongoStore.findSession, memStore.findSession),
  deleteSession: pick(mongoStore.deleteSession, memStore.deleteSession),
  // academias
  listGyms: (userId) => pick(mongoStore.listGyms, memStore.listGyms)(userId),
  findGymByName: (n, userId) => pick(mongoStore.findGymByName, memStore.findGymByName)(n, userId),
  createGym: pick(mongoStore.createGym, memStore.createGym),
  updateGym: (id, userId, d) => pick(mongoStore.updateGym, memStore.updateGym)(id, userId, d),
  deleteGym: (id, userId) => pick(mongoStore.deleteGym, memStore.deleteGym)(id, userId),
  getGym: (id, userId) => pick(mongoStore.getGym, memStore.getGym)(id, userId),
  firstGym: (userId) => pick(mongoStore.firstGym, memStore.firstGym)(userId),
  // exercícios
  listExercises: (userId) => pick(mongoStore.listExercises, memStore.listExercises)(userId),
  findExerciseByName: (n, gymId, userId) => pick(mongoStore.findExerciseByName, memStore.findExerciseByName)(n, gymId, userId),
  createExercise: pick(mongoStore.createExercise, memStore.createExercise),
  updateExercise: (id, userId, p) => pick(mongoStore.updateExercise, memStore.updateExercise)(id, userId, p),
  deleteExercise: (id, userId) => pick(mongoStore.deleteExercise, memStore.deleteExercise)(id, userId),
  // treinos
  listWorkouts: (userId, l) => pick(mongoStore.listWorkouts, memStore.listWorkouts)(userId, l),
  createWorkout: pick(mongoStore.createWorkout, memStore.createWorkout),
  deleteWorkout: (id, userId) => pick(mongoStore.deleteWorkout, memStore.deleteWorkout)(id, userId),
  // lista padrão para uma academia recém-criada
  async seedExercises(list, gymId, userId) {
    for (const s of list) await store.createExercise({ ...s, gymId, userId });
  },
};

module.exports = store;
