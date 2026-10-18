/* ============ Sequenc — app.js ============ */
'use strict';

// ---------- Constantes ----------
const GROUPS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Braços', 'Abdômen', 'Outros'];
const GROUP_COLORS = {
  'Peito': '#FF7A59',
  'Costas': '#FFA14A',
  'Pernas': '#FFC55C',
  'Ombros': '#FF9838',
  'Braços': '#FFB877',
  'Abdômen': '#FFD9A0',
  'Outros': '#6B6B74',
};
const DRAFT_KEY = 'sequenc.draft.v1';
const GYM_KEY = 'sequenc.gym.v1';
const QUEUE_KEY = 'sequenc.queue.v1';
const DATA_CACHE_KEY = 'sequenc.data.v1';

const ICONS = {
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  check: '<path d="M4 12l5 5L20 7"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 4h4"/><path d="M6.5 7l.8 13h9.4l.8-13"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>',
  play: '<path d="M7 5v14l12-7Z"/>',
  dumbbell: '<path d="M4.5 10v4"/><path d="M8 7v10"/><path d="M16 7v10"/><path d="M19.5 10v4"/><path d="M8 12h8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3.5 10h17"/>',
  flame: '<path d="M12 3s1 2.5 1 4.5S11.5 11 11.5 13a2.6 2.6 0 0 0 5.2.3C18 12 17 9.5 17 9.5c2 2 3 4.5 3 6.5a8 8 0 0 1-16 0c0-4 3.5-7 4.5-10C9.7 7.7 12 3 12 3Z"/>',
};

function icon(name, cls) {
  const fill = name === 'play' ? ' fill="currentColor" stroke="none"' : '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${fill} ${cls ? `class="${cls}"` : ''}>${ICONS[name]}</svg>`;
}

// ---------- Estado ----------
const state = {
  tab: 'treino',
  exercises: [],
  workouts: [],
  gyms: [],
  gymId: null,        // academia selecionada (treino / exercícios)
  gymFilter: 'all',   // filtro da aba exercícios: 'all' | gymId
  histFilter: 'all',  // filtro da aba histórico: 'all' | gymId
  lastPerf: new Map(), // exerciseId -> { date, sets }
  draft: null,
  demo: false,
  flashId: null,
  pendingId: null,
};

const sheetState = { editId: null, group: 'Outros', addedIds: new Set(), gymId: null, editGymId: null };

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function parseNum(str) {
  const n = parseFloat(String(str ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function fmtKg(n) {
  if (n == null) return '—';
  const s = Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return s;
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
}

function fmtDateShort(ts) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function relTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 30) return `há ${d} dias`;
  return fmtDateShort(ts);
}

function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

async function api(url, opts = {}) {
  const init = { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts };
  // timeout: em rede pendurada (sem sinal), falha rápido e cai no modo offline
  if (!init.signal && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    init.signal = AbortSignal.timeout(6000);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
  return data;
}

let toastTimer = null;
function showToast(msg, accent = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('accent', accent);
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 300);
  }, 2400);
}

// ---------- Fila offline (treinos finalizados sem internet) ----------
let syncing = false;

function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const q = raw ? JSON.parse(raw) : [];
    return Array.isArray(q) ? q : [];
  } catch (e) { return []; }
}

function saveQueue(q) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* ignore */ }
}

// Tenta enviar os treinos da fila; para no primeiro fracasso e mantém o resto
async function syncQueue() {
  const q = loadQueue();
  if (!q.length || syncing) return;
  syncing = true;
  const remaining = [];
  let failed = false;
  for (const item of q) {
    if (failed) { remaining.push(item); continue; }
    try {
      await api('/api/workouts', { method: 'POST', body: JSON.stringify(item) });
    } catch (e) {
      failed = true;
      remaining.push(item);
    }
  }
  const sent = q.length - remaining.length;
  saveQueue(remaining);
  syncing = false;
  if (sent > 0) {
    await loadWorkouts().catch(() => {});
    renderAll();
    showToast(`${sent} treino${sent > 1 ? 's' : ''} enviado${sent > 1 ? 's' : ''} ao servidor`, true);
  }
}

function queueBannerHtml() {
  const pend = loadQueue().length;
  if (!pend) return '';
  return `<button class="queue-banner" data-action="sync-queue">
    <span class="q-dot"></span>
    ${pend} treino${pend > 1 ? 's' : ''} aguardando envio — toque para enviar agora
  </button>`;
}

// ---------- Cópia local dos dados (para usar o app sem internet) ----------
function saveDataCache() {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({
      gyms: state.gyms,
      exercises: state.exercises,
      workouts: state.workouts,
    }));
  } catch (e) { /* espaço cheio: ignora */ }
}

function fillFromDataCache() {
  try {
    const d = JSON.parse(localStorage.getItem(DATA_CACHE_KEY) || 'null');
    if (!d) return;
    if (!state.gyms.length && Array.isArray(d.gyms)) state.gyms = d.gyms;
    if (!state.exercises.length && Array.isArray(d.exercises)) state.exercises = d.exercises;
    if (!state.workouts.length && Array.isArray(d.workouts)) state.workouts = d.workouts;
    buildLastPerf();
  } catch (e) { /* cache corrompido: ignora */ }
}

// ---------- Dados ----------
async function loadExercises() {
  state.exercises = await api('/api/exercises');
  saveDataCache();
}

async function loadGyms() {
  state.gyms = await api('/api/gyms');
  // valida a academia salva / selecionada
  let saved = null;
  try { saved = localStorage.getItem(GYM_KEY); } catch (e) { /* ignore */ }
  const valid = state.gyms.find((g) => g.id === (state.gymId || saved));
  if (!valid) {
    state.gymId = state.gyms[0]?.id ?? null;
    try { localStorage.setItem(GYM_KEY, state.gymId ?? ''); } catch (e) { /* ignore */ }
  } else {
    state.gymId = valid.id;
  }
  if (state.gymFilter !== 'all' && !state.gyms.some((g) => g.id === state.gymFilter)) state.gymFilter = 'all';
  if (state.histFilter !== 'all' && !state.gyms.some((g) => g.id === state.histFilter)) state.histFilter = 'all';
  saveDataCache();
}

function selectGym(id) {
  state.gymId = id;
  try { localStorage.setItem(GYM_KEY, id ?? ''); } catch (e) { /* ignore */ }
}

function gymName(id) {
  return state.gyms.find((g) => g.id === id)?.name ?? '';
}

async function loadWorkouts() {
  state.workouts = await api('/api/workouts?limit=60');
  buildLastPerf();
  saveDataCache();
}

function buildLastPerf() {
  state.lastPerf = new Map();
  for (const w of state.workouts) {
    for (const it of w.items || []) {
      const id = it.exerciseId;
      if (id && !state.lastPerf.has(id)) {
        state.lastPerf.set(id, { date: w.date, sets: it.sets || [] });
      }
    }
  }
}

function bestSetLabel(id) {
  const p = state.lastPerf.get(id);
  if (!p || !p.sets.length) return null;
  const best = p.sets.slice().sort((a, b) => (b.weight - a.weight) || (b.reps - a.reps))[0];
  return `${fmtKg(best.weight)} kg × ${best.reps}`;
}

// ---------- Rascunho do treino (local) ----------
function saveDraft() {
  if (state.draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
  else localStorage.removeItem(DRAFT_KEY);
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.items)) state.draft = d;
    }
  } catch (e) { /* rascunho corrompido: ignora */ }
}

// Conserta rascunhos de sessões antigas: academia que não existe mais
// (ex.: servidor demo reiniciado) volta a apontar para uma academia válida
function repairDraft() {
  const d = state.draft;
  if (!d) return;
  if (!state.gyms.some((g) => g.id === d.gymId)) {
    d.gymId = state.gymId || state.gyms[0]?.id || '';
    d.gymName = gymName(d.gymId);
    saveDraft();
  }
}

function startWorkout(fromWorkout = null) {
  // Academia: a do treino repetido, ou a selecionada; fallback para a primeira
  let gymId = fromWorkout ? fromWorkout.gymId : state.gymId;
  if (!state.gyms.some((g) => g.id === gymId)) gymId = state.gyms[0]?.id ?? '';
  state.draft = {
    title: fromWorkout ? (fromWorkout.title || '') : '',
    startedAt: Date.now(),
    gymId,
    gymName: gymName(gymId),
    items: (fromWorkout ? fromWorkout.items : []).map((it) => ({
      exerciseId: it.exerciseId,
      name: it.name,
      group: it.group,
      sets: (it.sets || []).map((s) => ({ w: String(s.weight || ''), r: String(s.reps || '') })),
    })),
  };
  saveDraft();
  renderTreino();
}

function draftVolume() {
  return (state.draft?.items || []).reduce((t, it) =>
    t + it.sets.reduce((s, x) => s + parseNum(x.w) * parseNum(x.r), 0), 0);
}

function draftSetCount() {
  return (state.draft?.items || []).reduce((t, it) => t + it.sets.length, 0);
}

// ---------- Sheet ----------
function openSheet(html) {
  const sheet = $('#sheet');
  const backdrop = $('#backdrop');
  $('#sheet-content').innerHTML = html;
  sheet.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    backdrop.classList.add('show');
  });
}

function closeSheet() {
  const sheet = $('#sheet');
  const backdrop = $('#backdrop');
  sheet.classList.remove('open');
  backdrop.classList.remove('show');
  setTimeout(() => {
    sheet.hidden = true;
    backdrop.hidden = true;
    $('#sheet-content').innerHTML = '';
  }, 340);
}

function sheetShell(title, body, opts = {}) {
  return `
    <div class="sheet-head">
      <h2>${esc(title)}</h2>
      <button class="sheet-close" data-action="close-sheet" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">${body}</div>`;
}

function confirmSheet({ title, msg, action, label }) {
  const body = `
    <p style="font-size:14px;color:var(--muted);line-height:1.5;margin-top:-2px">${esc(msg)}</p>
    <button class="btn-danger" data-action="${action}">${esc(label)}</button>
    <button class="btn-ghost" data-action="close-sheet">Cancelar</button>`;
  openSheet(sheetShell(title, body));
}

// ---------- Sheets: exercício ----------
function openNewExerciseSheet(editId = null) {
  sheetState.editId = editId;
  const editing = editId ? state.exercises.find((e) => e.id === editId) : null;
  sheetState.group = editing ? editing.group : 'Outros';
  // academia padrão: a do exercício editado, do filtro atual ou a selecionada
  sheetState.gymId = editing
    ? editing.gymId
    : (state.tab === 'exercicios' && state.gymFilter !== 'all' ? state.gymFilter : state.gymId) || state.gyms[0]?.id;
  const gymChips = state.gyms.map((g) =>
    `<button class="group-chip ${g.id === sheetState.gymId ? 'sel' : ''}" data-action="pick-gym" data-arg="${esc(g.id)}">${esc(g.name)}</button>`
  ).join('');
  const chips = GROUPS.map((g) =>
    `<button class="group-chip ${g === sheetState.group ? 'sel' : ''}" data-action="pick-group" data-arg="${esc(g)}">${esc(g)}</button>`
  ).join('');
  const body = `
    <label class="field-label">Nome do exercício</label>
    <input class="field-input" id="new-ex-name" placeholder="Ex.: Supino reto com barra"
           value="${editing ? esc(editing.name) : ''}" maxlength="60" enterkeyhint="done">
    <label class="field-label">Academia</label>
    <div class="group-chips">${gymChips}</div>
    <label class="field-label">Grupo muscular</label>
    <div class="group-chips">${chips}</div>
    <button class="btn-primary" data-action="save-ex">${editing ? 'Salvar alterações' : 'Adicionar exercício'}</button>
    ${editing ? '<button class="btn-text-danger" data-action="ex-del-ask">Excluir exercício</button>' : ''}`;
  openSheet(sheetShell(editing ? 'Editar exercício' : 'Novo exercício', body));
  setTimeout(() => $('#new-ex-name')?.focus(), 380);
}

function exerciseSessions(id) {
  const out = [];
  for (const w of state.workouts) {
    for (const it of w.items || []) {
      if (it.exerciseId === id) {
        out.push({ date: w.date, sets: it.sets || [] });
        if (out.length >= 5) return out;
      }
    }
  }
  return out;
}

function openExerciseDetailSheet(id) {
  const ex = state.exercises.find((e) => e.id === id);
  if (!ex) return;
  const sessions = exerciseSessions(id);
  const rows = sessions.length
    ? sessions.map((s) => {
        const best = s.sets.slice().sort((a, b) => (b.weight - a.weight) || (b.reps - a.reps))[0];
        return `<div class="detail-row">
          <div class="d-left">${fmtDateShort(s.date)} <span class="d-date">${relTime(s.date)}</span></div>
          <div class="d-right">${best ? `${fmtKg(best.weight)} kg × ${best.reps}` : '—'}</div>
        </div>`;
      }).join('')
    : `<div class="empty">${icon('dumbbell')}<p>Nenhum treino registrado<br>com este exercício ainda.</p></div>`;
  const body = `
    <div style="display:flex;align-items:center;gap:8px;margin:0 2px 14px">
      <span class="g-dot" style="background:${GROUP_COLORS[ex.group] || GROUP_COLORS['Outros']}"></span>
      <span style="font-size:13.5px;color:var(--muted);font-weight:600">${esc(ex.group)}</span>
    </div>
    <div class="sec-title" style="margin-top:0">Últimos treinos</div>
    <div class="detail-rows">${rows}</div>
    <button class="btn-ghost" data-action="ex-edit" data-arg="${esc(id)}" style="margin-top:14px">
      <span style="display:flex;align-items:center;justify-content:center;gap:8px">${icon('edit')} Renomear</span>
    </button>`;
  openSheet(sheetShell(ex.name, body));
}

// ---------- Sheet: gerenciar academias ----------
function gymExerciseCount(id) {
  return state.exercises.filter((e) => e.gymId === id).length;
}

function openGymsSheet() {
  sheetState.editGymId = null;
  openSheet(sheetShell('Academias', ''));
  renderGymsSheet();
}

function renderGymsSheet() {
  const editing = sheetState.editGymId ? state.gyms.find((g) => g.id === sheetState.editGymId) : null;
  const rows = state.gyms.map((g) => `
    <div class="gym-row">
      <span class="g-dot"></span>
      <span class="g-name">${esc(g.name)}</span>
      <span class="g-count">${gymExerciseCount(g.id)} exerc.</span>
      <button class="g-btn" data-action="gym-edit" data-arg="${esc(g.id)}" aria-label="Renomear academia">${icon('edit')}</button>
      <button class="g-btn del" data-action="gym-del-ask" data-arg="${esc(g.id)}" aria-label="Excluir academia">${icon('trash')}</button>
    </div>`).join('');
  $('#sheet-content').innerHTML = `
    <div class="sheet-head">
      <h2>Academias</h2>
      <button class="sheet-close" data-action="close-sheet" aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="sheet-body">
      <label class="field-label">${editing ? 'Renomear academia' : 'Nova academia'}</label>
      <input class="field-input" id="gym-name" placeholder="Ex.: Smart Fit, CrossFit Box, Casa"
             value="${editing ? esc(editing.name) : ''}" maxlength="40" enterkeyhint="done">
      <button class="btn-primary" data-action="save-gym">${editing ? 'Salvar alterações' : 'Adicionar academia'}</button>
      ${editing ? '<button class="btn-ghost" data-action="gym-edit-cancel" style="margin-top:10px">Cancelar edição</button>' : ''}
      <label class="field-label" style="margin-top:18px">Suas academias (${state.gyms.length})</label>
      ${rows || '<p style="font-size:13.5px;color:var(--muted)">Nenhuma academia ainda.</p>'}
      <p style="font-size:12px;color:var(--faint);margin-top:12px;line-height:1.5">Ao excluir uma academia, os exercícios dela passam para a academia mais antiga. Os treinos antigos mantêm o nome da academia no histórico.</p>
    </div>`;
  if (editing) setTimeout(() => $('#gym-name')?.focus(), 60);
}

async function saveGym() {
  const name = ($('#gym-name')?.value || '').trim();
  if (!name) {
    showToast('Digite o nome da academia.');
    return;
  }
  try {
    if (sheetState.editGymId) {
      await api(`/api/gyms/${sheetState.editGymId}`, { method: 'PUT', body: JSON.stringify({ name }) });
      const g = state.gyms.find((x) => x.id === sheetState.editGymId);
      if (g) g.name = name;
      // reflete no rascunho aberto
      if (state.draft && state.draft.gymId === g?.id) {
        state.draft.gymName = name;
        saveDraft();
      }
      showToast('Academia renomeada.', true);
      sheetState.editGymId = null;
    } else {
      const created = await api('/api/gyms', { method: 'POST', body: JSON.stringify({ name }) });
      state.gyms.push(created);
      selectGym(created.id);
      showToast('Academia adicionada.', true);
    }
    state.gyms.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    renderGymsSheet();
    renderAll();
  } catch (e) {
    showToast(e.message);
  }
}

// ---------- Sheet: seletor de exercícios ----------
function openPickerSheet() {
  repairDraft(); // academia do treino pode ter deixado de existir
  sheetState.addedIds = new Set((state.draft?.items || []).map((i) => i.exerciseId));
  const gymLabel = state.draft?.gymName || 'Todas as academias';
  const body = `
    <div style="margin:0 2px 10px"><span class="chip">${esc(gymLabel)}</span></div>
    <div class="search-wrap">
      ${icon('search')}
      <input class="search" id="picker-q" placeholder="Buscar exercício" autocomplete="off">
    </div>
    <div id="picker-list"></div>
    <button class="btn-primary" data-action="close-sheet">Concluir</button>`;
  openSheet(sheetShell('Adicionar exercício', body));
  renderPickerList('');
  $('#picker-q').addEventListener('input', (e) => renderPickerList(e.target.value));
}

function renderPickerList(q) {
  const term = (q || '').trim().toLowerCase();
  const draft = state.draft;
  // mostra apenas exercícios da academia do treino em andamento
  const gymOk = draft && state.gyms.some((g) => g.id === draft.gymId);
  const pool = state.exercises.filter((e) => !draft || !gymOk || e.gymId === draft.gymId);
  const list = pool.filter((e) => !term || e.name.toLowerCase().includes(term));
  const host = $('#picker-list');
  if (!host) return;
  if (!list.length) {
    const msg = gymOk && !pool.length
      ? `Nenhum exercício cadastrado em <b>${esc(draft.gymName)}</b>.<br>Adicione na aba Exercícios.`
      : 'Nenhum exercício encontrado.';
    host.innerHTML = `<div class="empty">${icon('search')}<p>${msg}</p></div>`;
    return;
  }
  host.innerHTML = GROUPS.map((g) => {
    const items = list.filter((e) => e.group === g);
    if (!items.length) return '';
    return `
      <div class="sec-title"><span class="g-dot" style="background:${GROUP_COLORS[g]}"></span>${esc(g)}</div>
      ${items.map((e) => {
        const added = sheetState.addedIds.has(e.id);
        const perf = bestSetLabel(e.id);
        return `<button class="ex-row" data-action="pick-add" data-arg="${esc(e.id)}" style="${added ? 'opacity:.55' : ''}">
          <span class="name">${esc(e.name)}</span>
          <span class="right">
            ${perf ? `<span class="perf">${esc(perf)}</span>` : ''}
            ${added ? icon('check') : ''}
          </span>
        </button>`;
      }).join('')}`;
  }).join('');
}

// ---------- Sheet: detalhe do treino ----------
function openWorkoutDetailSheet(id) {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return;
  const body = `
    <div class="totals">
      <span>${(w.items || []).length} exercícios</span>
      <span><b>${(w.items || []).reduce((t, i) => t + (i.sets || []).length, 0)}</b> séries</span>
      <span>vol. <b>${fmtKg(w.volume || 0)} kg</b></span>
    </div>
    ${(w.items || []).map((it) => `
      <div class="detail-ex">
        <h4>${esc(it.name)}<span class="d-group">${esc(it.group)}</span></h4>
        <div class="set-grid">
          ${(it.sets || []).map((s, i) => `<span class="set-pill">${i + 1} · <b>${fmtKg(s.weight)}</b> kg × ${s.reps}</span>`).join('') || '<span style="font-size:13px;color:var(--faint)">Sem séries</span>'}
        </div>
      </div>`).join('')}
    <button class="btn-danger" data-action="hist-del-ask" data-arg="${esc(id)}">
      <span style="display:flex;align-items:center;justify-content:center;gap:8px">${icon('trash')} Excluir treino</span>
    </button>`;
  openSheet(sheetShell(`${w.title || 'Treino'} · ${fmtDateShort(w.date)}`, body));
}

// ---------- Render: Treino ----------
function renderTreino() {
  const host = $('#view-treino');
  const d = state.draft;

  if (!d) {
    const now = Date.now();
    // estatísticas da academia selecionada
    const week = state.workouts.filter((w) =>
      now - new Date(w.date).getTime() < 7 * 864e5 &&
      (w.gymId ? w.gymId === state.gymId : !state.gymId));
    const weekVol = week.reduce((t, w) => t + (w.volume || 0), 0);
    const weekSets = week.reduce((t, w) => t + (w.items || []).reduce((s, i) => s + (i.sets || []).length, 0), 0);
    const lastForGym = state.workouts.find((w) => (w.gymId ? w.gymId === state.gymId : !state.gymId));
    const hasLast = !!lastForGym;
    const gymChips = state.gyms.map((g) =>
      `<button class="group-chip ${g.id === state.gymId ? 'sel' : ''}" data-action="sel-gym" data-arg="${esc(g.id)}">${esc(g.name)}</button>`
    ).join('');
    host.innerHTML = `
      <section class="card start-card">
        <div class="start-icon">${icon('dumbbell')}</div>
        <h2>Pronto para treinar?</h2>
        <p>Registre séries, cargas e acompanhe<br>sua evolução semana a semana.</p>
        <div class="gym-q">Onde você vai treinar hoje?</div>
        <div class="gym-chips">${gymChips}
          <button class="group-chip chip-manage" data-action="manage-gyms" aria-label="Gerenciar academias">${icon('edit')}</button>
        </div>
        <button class="btn-primary" data-action="start-workout">${icon('play')} Iniciar treino</button>
        ${hasLast ? '<button class="btn-ghost" data-action="repeat-last">Repetir último treino</button>' : ''}
      </section>
      ${queueBannerHtml()}
      <div class="stat-row">
        <div class="stat"><b>${week.length}</b><span>treinos / 7 dias</span></div>
        <div class="stat"><b>${fmtKg(weekVol)}</b><span>kg levantados</span></div>
        <div class="stat"><b>${weekSets}</b><span>séries</span></div>
      </div>`;
    return;
  }

  const itemsHtml = d.items.map((it, i) => {
    const perf = bestSetLabel(it.exerciseId);
    return `
      <section class="card ex-card">
        <div class="ex-head">
          <div>
            <h3>${esc(it.name)}</h3>
            <div class="ex-tags">
              <span class="chip">${esc(it.group)}</span>
              ${perf ? `<span class="last-hint">última: ${esc(perf)}</span>` : ''}
            </div>
          </div>
          <button class="ex-x" data-action="del-item" data-arg="${i}" aria-label="Remover exercício">${icon('x')}</button>
        </div>
        <div class="sets">
          ${it.sets.map((s, si) => `
            <div class="set-row">
              <span class="set-n">${si + 1}</span>
              <input class="set-input" inputmode="decimal" placeholder="0" value="${esc(s.w)}"
                     data-field="w" data-i="${i}" data-s="${si}" enterkeyhint="next" aria-label="Peso da série ${si + 1}">
              <span class="unit">kg ×</span>
              <input class="set-input" inputmode="numeric" placeholder="0" value="${esc(s.r)}"
                     data-field="r" data-i="${i}" data-s="${si}" enterkeyhint="done" aria-label="Repetições da série ${si + 1}">
              <span class="unit">rep</span>
              <button class="mini-del" data-action="del-set" data-i="${i}" data-s="${si}" aria-label="Remover série">${icon('x')}</button>
            </div>`).join('')}
        </div>
        <button class="btn-add-set" data-action="add-set" data-arg="${i}">${icon('plus')} Adicionar série</button>
      </section>`;
  }).join('');

  host.innerHTML = `
    <section class="card draft-head">
      <input class="draft-title" placeholder="Nome do treino (ex.: Push, A, Peito e tríceps)"
             maxlength="60" data-field="title" value="${esc(d.title)}" aria-label="Nome do treino">
      <div class="draft-meta">
        <span class="chip">${esc(d.gymName || 'Sem academia')}</span>
        <span class="dot">·</span>
        <span class="timer" id="draft-timer">${elapsed(Date.now() - d.startedAt)}</span>
        <span class="dot">·</span><span>${d.items.length} exercícios</span>
        <span class="dot">·</span><span>${draftSetCount()} séries</span>
        <span class="dot">·</span><span>${fmtKg(draftVolume())} kg</span>
      </div>
    </section>
    ${itemsHtml}
    <button class="btn-dashed" data-action="pick-open" style="margin-top:12px">${icon('plus')} Adicionar exercício</button>
    <div class="finish-row">
      <button class="btn-primary" data-action="finish">${icon('check')} Finalizar treino</button>
      <button class="btn-text-danger" data-action="discard-ask">Descartar treino</button>
    </div>`;
}

// ---------- Render: Exercícios ----------
let searchQ = '';

function gymFilterChips(active, action) {
  const chips = [`<button class="f-chip ${active === 'all' ? 'sel' : ''}" data-action="${action}" data-arg="all">Todas</button>`];
  for (const g of state.gyms) {
    chips.push(`<button class="f-chip ${active === g.id ? 'sel' : ''}" data-action="${action}" data-arg="${esc(g.id)}">${esc(g.name)}</button>`);
  }
  chips.push(`<button class="f-chip add" data-action="manage-gyms" aria-label="Gerenciar academias">${icon('plus')}</button>`);
  return `<div class="filter-row">${chips.join('')}</div>`;
}

function renderExercicios() {
  const host = $('#view-exercicios');
  const term = searchQ.trim().toLowerCase();
  const pool = state.gymFilter === 'all'
    ? state.exercises
    : state.exercises.filter((e) => e.gymId === state.gymFilter);
  const list = pool.filter((e) => !term || e.name.toLowerCase().includes(term));
  const showGymTag = state.gymFilter === 'all' && state.gyms.length > 1;

  const sections = GROUPS.map((g) => {
    const items = list.filter((e) => e.group === g);
    if (!items.length) return '';
    return `
      <div class="sec-title"><span class="g-dot" style="background:${GROUP_COLORS[g]}"></span>${esc(g)} <span class="count">· ${items.length}</span></div>
      ${items.map((e) => {
        const perf = bestSetLabel(e.id);
        const tag = showGymTag ? `<span class="perf">${esc(gymName(e.gymId) || '—')}</span>` : '';
        return `<button class="ex-row" data-action="ex-open" data-arg="${esc(e.id)}">
          <span class="name">${esc(e.name)}</span>
          <span class="right">${tag}${perf ? `<span class="perf">${esc(perf)}</span>` : ''}${icon('chev', 'chev')}</span>
        </button>`;
      }).join('')}`;
  }).join('');

  host.innerHTML = `
    <div class="search-wrap">
      ${icon('search')}
      <input class="search" id="ex-search" placeholder="Buscar exercício" value="${esc(searchQ)}" autocomplete="off">
    </div>
    ${gymFilterChips(state.gymFilter, 'filter-gym')}
    ${state.exercises.length === 0
      ? `<div class="empty">${icon('dumbbell')}<p>Nenhum exercício cadastrado.<br>Toque em <b>+</b> para adicionar o primeiro.</p></div>`
      : (list.length
          ? sections
          : (searchQ.trim()
              ? `<div class="empty">${icon('search')}<p>Nada encontrado para<br><b>${esc(searchQ)}</b>.</p></div>`
              : `<div class="empty">${icon('dumbbell')}<p>Nenhum exercício nesta academia ainda.<br>Toque em <b>+</b> para adicionar.</p></div>`))}`;

  $('#ex-search')?.addEventListener('input', (e) => {
    searchQ = e.target.value;
    renderExercicios();
    $('#ex-search').focus();
    const v = $('#ex-search');
    v.setSelectionRange(v.value.length, v.value.length);
  });
}

// ---------- Render: Histórico ----------
function renderHistorico() {
  const host = $('#view-historico');
  const filtered = state.histFilter === 'all'
    ? state.workouts
    : state.workouts.filter((w) => w.gymId === state.histFilter);

  if (!state.workouts.length) {
    host.innerHTML = `
      ${gymFilterChips('all', 'hist-filter')}
      <div class="empty">${icon('clock')}<p>Nenhum treino finalizado ainda.<br>Seu histórico aparece aqui.</p></div>`;
    return;
  }
  const showGymTag = state.histFilter === 'all' && state.gyms.length > 1;
  host.innerHTML = `
    ${gymFilterChips(state.histFilter, 'hist-filter')}
    ${filtered.length ? filtered.map((w) => {
      const sets = (w.items || []).reduce((t, i) => t + (i.sets || []).length, 0);
      return `
      <button class="card hist-card ${state.flashId === w.id ? 'flash' : ''}" data-action="hist-open" data-arg="${esc(w.id)}">
        <div class="hist-top">
          <span class="hist-title">${esc(w.title || 'Treino')}</span>
          <span class="hist-date">${fmtDateShort(w.date)} · ${fmtTime(w.date)}</span>
        </div>
        <div class="hist-chips">
          ${showGymTag && w.gymName ? `<span class="mini-chip accent">${esc(w.gymName)}</span>` : ''}
          <span class="mini-chip">${(w.items || []).length} exercícios</span>
          <span class="mini-chip">${sets} séries</span>
          <span class="mini-chip accent">${fmtKg(w.volume || 0)} kg</span>
        </div>
      </button>`;
    }).join('') : `<div class="empty">${icon('clock')}<p>Nenhum treino nesta academia ainda.</p></div>`}`;
  state.flashId = null;
}

// ---------- Título / topo ----------
const TAB_TITLES = { treino: 'Treino', exercicios: 'Exercícios', historico: 'Histórico' };

function renderTop() {
  $('#page-title').textContent = TAB_TITLES[state.tab];
  const sub = $('#page-sub');
  if (state.tab === 'treino') sub.textContent = fmtDate(Date.now());
  if (state.tab === 'exercicios') sub.textContent = `${state.exercises.length} exercícios`;
  if (state.tab === 'historico') sub.textContent = `${state.workouts.length} treinos registrados`;

  const action = $('#top-action');
  action.hidden = true;
  if (state.tab === 'exercicios') {
    action.innerHTML = icon('plus');
    action.hidden = false;
  } else if (state.tab === 'treino' && state.draft) {
    action.innerHTML = icon('plus');
    action.hidden = false;
  }
}

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.arg === tab));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  $(`#view-${tab}`).classList.add('active');
  if (tab === 'treino') renderTreino();
  if (tab === 'exercicios') renderExercicios();
  if (tab === 'historico') renderHistorico();
  renderTop();
  window.scrollTo({ top: 0 });
}

function renderAll() {
  renderTreino();
  renderExercicios();
  renderHistorico();
  renderTop();
}

// ---------- Ações ----------
// Falha de rede (sem sinal, timeout, servidor fora): salvar na fila do celular
function isNetworkError(e) {
  return e instanceof TypeError || e.name === 'TimeoutError' || e.name === 'AbortError';
}

async function finishWorkout() {
  const d = state.draft;
  if (!d) return;
  const items = d.items
    .map((it) => ({
      exerciseId: it.exerciseId,
      name: it.name,
      group: it.group,
      sets: it.sets
        .map((s) => ({ weight: parseNum(s.w), reps: Math.round(parseNum(s.r)) }))
        .filter((s) => s.weight > 0 || s.reps > 0),
    }))
    .filter((it) => it.sets.length > 0);

  if (!items.length) {
    showToast('Preencha pelo menos uma série antes de finalizar.');
    return;
  }

  const payload = { title: d.title, date: d.startedAt, gymId: d.gymId, gymName: d.gymName, items };

  // Sem internet: guarda na fila do celular — sobe sozinho quando o sinal voltar
  if (!navigator.onLine) {
    const q = loadQueue();
    q.push(payload);
    saveQueue(q);
    state.draft = null;
    saveDraft();
    renderTreino();
    renderTop();
    showToast('Sem internet: treino salvo no celular e será enviado sozinho.', true);
    return;
  }

  try {
    const saved = await api('/api/workouts', { method: 'POST', body: JSON.stringify(payload) });
    state.draft = null;
    saveDraft();
    await loadWorkouts();
    state.flashId = saved.id;
    switchTab('historico');
    showToast('Treino salvo. Bora pra próxima! 💪', true);
  } catch (e) {
    if (isNetworkError(e)) {
      // falha de rede no meio do caminho
      const q = loadQueue();
      q.push(payload);
      saveQueue(q);
      state.draft = null;
      saveDraft();
      renderTreino();
      renderTop();
      showToast('Sem internet: treino salvo no celular e será enviado sozinho.', true);
    } else {
      showToast(e.message);
    }
  }
}

async function saveExercise() {
  const name = ($('#new-ex-name')?.value || '').trim();
  if (!name) {
    showToast('Digite o nome do exercício.');
    return;
  }
  const payload = { name, group: sheetState.group, gymId: sheetState.gymId };
  try {
    if (sheetState.editId) {
      await api(`/api/exercises/${sheetState.editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      // atualiza o nome no rascunho aberto, se o exercício estiver lá
      if (state.draft) {
        for (const it of state.draft.items) {
          if (it.exerciseId === sheetState.editId) it.name = name;
        }
        saveDraft();
      }
      showToast('Exercício atualizado.', true);
    } else {
      const created = await api('/api/exercises', { method: 'POST', body: JSON.stringify(payload) });
      state.exercises.push(created);
      showToast('Exercício adicionado.', true);
    }
    state.exercises.sort((a, b) =>
      GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || a.name.localeCompare(b.name, 'pt-BR'));
    closeSheet();
    renderAll();
  } catch (e) {
    showToast(e.message);
  }
}

// ---------- Eventos globais ----------
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const arg = btn.dataset.arg;
  const draft = state.draft;

  switch (action) {
    case 'tab':
      switchTab(arg);
      break;

    case 'top-action':
      if (state.tab === 'exercicios') openNewExerciseSheet();
      else if (state.tab === 'treino' && draft) openPickerSheet();
      break;

    case 'start-workout':
      startWorkout();
      break;

    case 'repeat-last':
      if (state.workouts.length) startWorkout(state.workouts[0]);
      break;

    case 'pick-open':
      openPickerSheet();
      break;

    case 'pick-add': {
      const ex = state.exercises.find((x) => x.id === arg);
      if (!ex || !draft) break;
      if (draft.items.some((i) => i.exerciseId === ex.id)) {
        showToast('Este exercício já está no treino.');
        break;
      }
      draft.items.push({ exerciseId: ex.id, name: ex.name, group: ex.group, sets: [{ w: '', r: '' }] });
      sheetState.addedIds.add(ex.id);
      saveDraft();
      renderTreino();
      renderTop();
      const term = ($('#picker-q')?.value || '');
      renderPickerList(term);
      break;
    }

    case 'pick-group': {
      sheetState.group = arg;
      document.querySelectorAll('.group-chip').forEach((c) => c.classList.toggle('sel', c.dataset.arg === arg && c.dataset.action === 'pick-group'));
      break;
    }

    case 'pick-gym': {
      sheetState.gymId = arg;
      document.querySelectorAll('[data-action="pick-gym"]').forEach((c) => c.classList.toggle('sel', c.dataset.arg === arg));
      break;
    }

    case 'sel-gym':
      selectGym(arg);
      renderTreino();
      break;

    case 'manage-gyms':
      openGymsSheet();
      break;

    case 'save-gym':
      saveGym();
      break;

    case 'gym-edit':
      sheetState.editGymId = arg;
      renderGymsSheet();
      break;

    case 'gym-edit-cancel':
      sheetState.editGymId = null;
      renderGymsSheet();
      break;

    case 'gym-del-ask':
      state.pendingId = arg;
      confirmSheet({
        title: 'Excluir academia?',
        msg: `Os ${gymExerciseCount(arg)} exercícios desta academia passarão para a academia mais antiga. Os treinos do histórico não são afetados.`,
        action: 'gym-del-yes',
        label: 'Excluir academia',
      });
      break;

    case 'gym-del-yes':
      (async () => {
        try {
          const out = await api(`/api/gyms/${state.pendingId}`, { method: 'DELETE' });
          await loadGyms();
          await Promise.all([loadExercises(), loadWorkouts()]);
          closeSheet();
          renderAll();
          if (out?.movedTo?.name) showToast(`Exercícios movidos para ${out.movedTo.name}.`);
          else showToast('Academia excluída.');
        } catch (err) { showToast(err.message); }
      })();
      break;

    case 'filter-gym':
      state.gymFilter = arg;
      renderExercicios();
      break;

    case 'hist-filter':
      state.histFilter = arg;
      renderHistorico();
      break;

    case 'save-ex':
      saveExercise();
      break;

    case 'ex-open':
      openExerciseDetailSheet(arg);
      break;

    case 'ex-edit':
      openNewExerciseSheet(arg);
      break;

    case 'ex-del-ask':
      state.pendingId = sheetState.editId;
      confirmSheet({
        title: 'Excluir exercício?',
        msg: 'O exercício será removido da lista. Treinos antigos continuam com o histórico dele.',
        action: 'ex-del-yes',
        label: 'Excluir',
      });
      break;

    case 'ex-del-yes':
      (async () => {
        try {
          await api(`/api/exercises/${state.pendingId}`, { method: 'DELETE' });
          state.exercises = state.exercises.filter((x) => x.id !== state.pendingId);
          closeSheet();
          renderAll();
          showToast('Exercício excluído.');
        } catch (err) { showToast(err.message); }
      })();
      break;

    case 'add-set': {
      if (!draft) break;
      const it = draft.items[Number(arg)];
      if (!it) break;
      const last = it.sets[it.sets.length - 1];
      it.sets.push({ w: last ? last.w : '', r: last ? last.r : '' });
      saveDraft();
      renderTreino();
      const inputs = document.querySelectorAll(`[data-field="w"][data-i="${arg}"]`);
      const newInput = inputs[inputs.length - 1];
      if (newInput) {
        newInput.focus();
        newInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      break;
    }

    case 'del-set': {
      if (!draft) break;
      const it = draft.items[Number(btn.dataset.i)];
      if (it) {
        it.sets.splice(Number(btn.dataset.s), 1);
        if (!it.sets.length) it.sets.push({ w: '', r: '' });
        saveDraft();
        renderTreino();
      }
      break;
    }

    case 'del-item': {
      if (!draft) break;
      draft.items.splice(Number(arg), 1);
      saveDraft();
      renderTreino();
      renderTop();
      break;
    }

    case 'finish':
      finishWorkout();
      break;

    case 'discard-ask':
      confirmSheet({
        title: 'Descartar treino?',
        msg: 'Todas as séries registradas neste treino serão perdidas.',
        action: 'discard-yes',
        label: 'Descartar',
      });
      break;

    case 'discard-yes':
      state.draft = null;
      saveDraft();
      closeSheet();
      renderTreino();
      renderTop();
      break;

    case 'sync-queue':
      syncQueue();
      break;

    case 'hist-open':
      openWorkoutDetailSheet(arg);
      break;

    case 'hist-del-ask':
      state.pendingId = arg;
      confirmSheet({
        title: 'Excluir treino?',
        msg: 'Este treino será removido do histórico permanentemente.',
        action: 'hist-del-yes',
        label: 'Excluir treino',
      });
      break;

    case 'hist-del-yes':
      (async () => {
        try {
          await api(`/api/workouts/${state.pendingId}`, { method: 'DELETE' });
          await loadWorkouts();
          closeSheet();
          renderHistorico();
          renderTop();
          showToast('Treino excluído.');
        } catch (err) { showToast(err.message); }
      })();
      break;

    case 'close-sheet':
      closeSheet();
      break;
  }
});

// edição de campos do rascunho
document.addEventListener('input', (e) => {
  const el = e.target;
  const draft = state.draft;
  if (!draft) return;
  if (el.dataset.field === 'title') {
    draft.title = el.value;
    saveDraft();
  } else if (el.dataset.field === 'w' || el.dataset.field === 'r') {
    let v = el.value;
    if (el.dataset.field === 'w') v = v.replace(/[^0-9.,]/g, '').replace('.', ',');
    else v = v.replace(/[^0-9]/g, '');
    if (v !== el.value) el.value = v;
    const it = draft.items[Number(el.dataset.i)];
    if (it && it.sets[Number(el.dataset.s)]) {
      it.sets[Number(el.dataset.s)][el.dataset.field] = v;
      saveDraft();
    }
  }
});

$('#backdrop').addEventListener('click', closeSheet);

// atualiza timer do treino a cada segundo
setInterval(() => {
  const el = $('#draft-timer');
  if (el && state.draft) el.textContent = elapsed(Date.now() - state.draft.startedAt);
}, 1000);

// recarrega dados quando o app volta do segundo plano
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    (async () => {
      try {
        await Promise.all([loadGyms(), loadExercises(), loadWorkouts()]);
        renderAll();
        syncQueue();
      } catch (e) { /* silencioso */ }
    })();
  }
});

// internet voltou: envia a fila automaticamente
window.addEventListener('online', () => syncQueue());

// ---------- Boot ----------
(async function boot() {
  loadDraft();
  try {
    const health = await api('/api/health').catch(() => ({ db: 'mongo' }));
    state.demo = health.db === 'memoria';
    $('#demo-pill').hidden = !state.demo;
    await Promise.all([loadGyms(), loadExercises(), loadWorkouts()]);
  } catch (e) {
    // offline: mantém o que carregou e completa com a cópia salva no aparelho
    fillFromDataCache();
    showToast('Você está offline — mostrando os dados salvos no aparelho.');
  }
  repairDraft();
  renderAll();
  syncQueue();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW: app funciona online */ });
  }
  const loader = $('#loader');
  loader.classList.add('out');
  setTimeout(() => loader.remove(), 400);
})();
