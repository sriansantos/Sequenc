// Camada de dados com dois drivers:
//  - MongoDB (mongoose) quando MONGODB_URI está definida (produção / Render + Atlas)
//  - Em memória, quando não está (modo demo local, dados se perdem ao reiniciar)
const mongoose = require('mongoose');
const crypto = require('crypto');
const { GROUPS, SEED_EXERCISES } = require('./seed');

let mode = null;

// ---------- Schemas ----------
const gymSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    group: { type: String, default: 'Outros', enum: GROUPS },
    gymId: { type: String, default: '', index: true },
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
    items: [itemSchema],
  },
  { versionKey: false }
);

// ---------- Driver MongoDB ----------
const Gym = mongoose.model('Gym', gymSchema);
const Exercise = mongoose.model('Exercise', exerciseSchema);
const Workout = mongoose.model('Workout', workoutSchema);

function groupIndex(g) {
  const i = GROUPS.indexOf(g);
  return i === -1 ? GROUPS.length : i;
}

function sortExercises(list) {
  return list.slice().sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || a.name.localeCompare(b.name, 'pt-BR'));
}

const mongoStore = {
  async listGyms() {
    return Gym.find().sort({ createdAt: 1 }).lean();
  },
  async findGymByName(name) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Gym.findOne({ name: new RegExp('^' + escaped + '$', 'i') }).lean();
  },
  async createGym({ name }) {
    return Gym.create({ name });
  },
  async updateGym(id, { name }) {
    return Gym.findByIdAndUpdate(id, { name }, { new: true, runValidators: true }).lean();
  },
  // Exclui a academia movendo os exercícios dela para a academia restante mais antiga.
  // Retorna null se for a última academia (não pode excluir).
  async deleteGym(id) {
    const rest = await Gym.find({ _id: { $ne: id } }).sort({ createdAt: 1 }).lean();
    if (!rest.length) return null;
    const target = rest[0];
    await Exercise.updateMany({ gymId: id }, { $set: { gymId: target._id.toString() } });
    await Gym.findByIdAndDelete(id);
    return { movedTo: target };
  },
  async getGym(id) {
    if (!id) return null;
    return Gym.findById(id).lean();
  },
  async firstGym() {
    return Gym.findOne().sort({ createdAt: 1 }).lean();
  },
  async listExercises() {
    return sortExercises(await Exercise.find().lean());
  },
  async findExerciseByName(name, gymId) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Exercise.findOne({ name: new RegExp('^' + escaped + '$', 'i'), gymId }).lean();
  },
  async createExercise({ name, group, gymId }) {
    return Exercise.create({ name, group, gymId });
  },
  async updateExercise(id, patch) {
    return Exercise.findByIdAndUpdate(id, { name: patch.name, group: patch.group, gymId: patch.gymId }, { new: true, runValidators: true }).lean();
  },
  async deleteExercise(id) {
    const out = await Exercise.findByIdAndDelete(id);
    return !!out;
  },
  async listWorkouts(limit) {
    return Workout.find().sort({ date: -1 }).limit(limit).lean();
  },
  async createWorkout(data) {
    return Workout.create(data);
  },
  async deleteWorkout(id) {
    const out = await Workout.findByIdAndDelete(id);
    return !!out;
  },
  async init() {
    // Garante ao menos uma academia; migra exercícios sem academia para a primeira
    let gyms = await Gym.find().sort({ createdAt: 1 });
    if (!gyms.length) gyms = [await Gym.create({ name: 'Academia' })];
    const first = gyms[0];
    await Exercise.updateMany(
      { $or: [{ gymId: null }, { gymId: { $exists: false } }, { gymId: '' }] },
      { $set: { gymId: first._id.toString() } }
    );
    const count = await Exercise.countDocuments();
    if (count === 0) {
      await Exercise.insertMany(SEED_EXERCISES.map((s) => ({ ...s, gymId: first._id.toString() })));
    }
  },
};

// ---------- Driver em memória (demo) ----------
const mem = { gyms: [], exercises: [], workouts: [] };

const memStore = {
  async listGyms() {
    return mem.gyms.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },
  async findGymByName(name) {
    return mem.gyms.find((g) => g.name.toLowerCase() === String(name).toLowerCase()) || null;
  },
  async createGym({ name }) {
    const gym = { id: crypto.randomUUID(), name, createdAt: new Date() };
    mem.gyms.push(gym);
    return gym;
  },
  async updateGym(id, { name }) {
    const gym = mem.gyms.find((g) => g.id === id);
    if (!gym) return null;
    gym.name = name;
    return gym;
  },
  async deleteGym(id) {
    const rest = mem.gyms.filter((g) => g.id !== id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (!rest.length) return null;
    const target = rest[0];
    for (const ex of mem.exercises) {
      if (ex.gymId === id) ex.gymId = target.id;
    }
    mem.gyms = mem.gyms.filter((g) => g.id !== id);
    return { movedTo: target };
  },
  async getGym(id) {
    return mem.gyms.find((g) => g.id === id) || null;
  },
  async firstGym() {
    return mem.gyms.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
  },
  async listExercises() {
    return sortExercises(mem.exercises);
  },
  async findExerciseByName(name, gymId) {
    return (
      mem.exercises.find((e) => e.gymId === gymId && e.name.toLowerCase() === String(name).toLowerCase()) || null
    );
  },
  async createExercise({ name, group, gymId }) {
    const ex = { id: crypto.randomUUID(), name, group, gymId, createdAt: new Date() };
    mem.exercises.push(ex);
    return ex;
  },
  async updateExercise(id, patch) {
    const ex = mem.exercises.find((e) => e.id === id);
    if (!ex) return null;
    ex.name = patch.name;
    ex.group = patch.group;
    ex.gymId = patch.gymId;
    return ex;
  },
  async deleteExercise(id) {
    const before = mem.exercises.length;
    mem.exercises = mem.exercises.filter((e) => e.id !== id);
    return mem.exercises.length < before;
  },
  async listWorkouts(limit) {
    return mem.workouts.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);
  },
  async createWorkout(data) {
    const w = { id: crypto.randomUUID(), ...data };
    mem.workouts.push(w);
    return w;
  },
  async deleteWorkout(id) {
    const before = mem.workouts.length;
    mem.workouts = mem.workouts.filter((w) => w.id !== id);
    return mem.workouts.length < before;
  },
  async init() {
    let gyms = await memStore.listGyms();
    if (!gyms.length) gyms = [await memStore.createGym({ name: 'Academia' })];
    const first = gyms[0];
    for (const ex of mem.exercises) {
      if (!ex.gymId) ex.gymId = first.id;
    }
    if (!mem.exercises.length) {
      for (const s of SEED_EXERCISES) await memStore.createExercise({ ...s, gymId: first.id });
    }
  },
};

// ---------- Inicialização / fachada ----------
async function init(uri) {
  if (uri) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    mode = 'mongo';
    await mongoStore.init();
    console.log('✅ Conectado ao MongoDB.');
  } else {
    mode = 'memoria';
    await memStore.init();
    console.warn('⚠️  MONGODB_URI não definida — MODO DEMO em memória (dados se perdem ao reiniciar).');
  }
}

const store = {
  get mode() {
    return mode;
  },
  init,
  listGyms: () => (mode === 'mongo' ? mongoStore.listGyms() : memStore.listGyms()),
  findGymByName: (n) => (mode === 'mongo' ? mongoStore.findGymByName(n) : memStore.findGymByName(n)),
  createGym: (d) => (mode === 'mongo' ? mongoStore.createGym(d) : memStore.createGym(d)),
  updateGym: (id, d) => (mode === 'mongo' ? mongoStore.updateGym(id, d) : memStore.updateGym(id, d)),
  deleteGym: (id) => (mode === 'mongo' ? mongoStore.deleteGym(id) : memStore.deleteGym(id)),
  getGym: (id) => (mode === 'mongo' ? mongoStore.getGym(id) : memStore.getGym(id)),
  firstGym: () => (mode === 'mongo' ? mongoStore.firstGym() : memStore.firstGym()),
  listExercises: () => (mode === 'mongo' ? mongoStore.listExercises() : memStore.listExercises()),
  findExerciseByName: (n, gymId) => (mode === 'mongo' ? mongoStore.findExerciseByName(n, gymId) : memStore.findExerciseByName(n, gymId)),
  createExercise: (d) => (mode === 'mongo' ? mongoStore.createExercise(d) : memStore.createExercise(d)),
  updateExercise: (id, p) => (mode === 'mongo' ? mongoStore.updateExercise(id, p) : memStore.updateExercise(id, p)),
  deleteExercise: (id) => (mode === 'mongo' ? mongoStore.deleteExercise(id) : memStore.deleteExercise(id)),
  listWorkouts: (l) => (mode === 'mongo' ? mongoStore.listWorkouts(l) : memStore.listWorkouts(l)),
  createWorkout: (d) => (mode === 'mongo' ? mongoStore.createWorkout(d) : memStore.createWorkout(d)),
  deleteWorkout: (id) => (mode === 'mongo' ? mongoStore.deleteWorkout(id) : memStore.deleteWorkout(id)),
};

module.exports = store;
