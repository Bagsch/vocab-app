// ══════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════
const STORAGE_KEY = 'espanol_flow_v2';
const DAILY_GOAL = 10;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return JSON.parse(raw);
  } catch { return defaultState(); }
}

function defaultState() {
  return { cards: [], streak: 0, lastStudyDate: null, studyDays: [], todayCount: {}, nextId: 1 };
}

function saveData(st) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
}

let state = loadData();

// ══════════════════════════════════════════════
//  SM-2
// ══════════════════════════════════════════════
function sm2(progress, quality) {
  let { interval, repetitions, easeFactor } = progress;

  if (!easeFactor) easeFactor = 2.5;
  if (!interval) interval = 1;
  if (!repetitions) repetitions = 0;

  const grade = [0, 3, 4, 5][quality];

  switch (quality) {

  case 0: // Nochmal
    repetitions = 0;
    interval = 1;
    break;

  case 1: // Schwer
    if (repetitions === 0)
        interval = 1;
    else if (repetitions === 1)
        interval = 3;
    else
        interval = Math.round(interval * 1.2);

    repetitions++;
    easeFactor = Math.max(1.3, easeFactor - 0.15);
    break;

  case 2: // Gut
    if (repetitions === 0)
        interval = 1;
    else if (repetitions === 1)
        interval = 6;
    else
        interval = Math.round(interval * easeFactor);

    repetitions++;
    break;

  case 3: // Leicht
    if (repetitions === 0)
        interval = 3;
    else if (repetitions === 1)
        interval = 7;
    else
        interval = Math.round(interval * (easeFactor + 0.3));

    repetitions++;
    easeFactor += 0.15;
    break;
  }

  easeFactor =
    easeFactor +
    (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));

  if (easeFactor < 1.3)
    easeFactor = 1.3;

  progress.interval = interval;
  progress.repetitions = repetitions;
  progress.easeFactor = Math.round(easeFactor * 1000) / 1000;
  progress.lastReviewed = Date.now();

  const next = new Date();
  next.setHours(0, 0, 0, 0);      // Heute 00:00 Uhr
  next.setDate(next.getDate() + interval);

  progress.nextReview = next.getTime();

  progress.totalReviews = (progress.totalReviews || 0) + 1;
  progress.correctReviews =
    (progress.correctReviews || 0) + (grade >= 3 ? 1 : 0);

  return progress;
}

function isDue(card, direction) {
  const p = card.progress?.[direction];
  if (!p) return false;
  if (!p.nextReview) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return today.getTime() >= p.nextReview;
}

function getDueCards() {
  const due = [];

  state.cards.forEach(card => {
    if (isDue(card, 'es')) {
      due.push({ ...card, direction: 'es' });
    }

    if (isDue(card, 'de')) {
      due.push({ ...card, direction: 'de' });
    }
  });

  return due;
}

function intervalLabel(quality, card, direction) {
  if (quality === 0) return '< 1 min';

  const p = card.progress[direction];
  const copy = {
    interval: p.interval,
    repetitions: p.repetitions,
    easeFactor: p.easeFactor
  };

  sm2(copy, quality);

  const days = copy.interval;

  if (days <= 1) return '1 Tag';
  if (days < 30) return days + ' Tage';
  if (days < 365) return Math.round(days / 30) + ' Mon.';
  return Math.round(days / 365) + ' J.';
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function getTodayCount() {
  return state.todayCount?.[todayISO()] || 0;
}

// ══════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  const order = ['dashboard', 'vocab', 'import'];
  const tabs = document.querySelectorAll('.nav-tab');
  const idx = order.indexOf(name);
  if (tabs[idx]) tabs[idx].classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'vocab')     renderVocab();
  if (name === 'learn')     initLearnView();
}

// ══════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════
function renderDashboard() {
  const due      = getDueCards();
  const total    = state.cards.length;
  const count    = getTodayCount();
  const goalPct  = Math.min(100, Math.round(count / DAILY_GOAL * 100));
  const goalDone = count >= DAILY_GOAL;

  document.getElementById('stat-total').textContent  = total;
  document.getElementById('stat-due').textContent    = due.length;
  document.getElementById('stat-streak').textContent = getStreak();
  document.getElementById('dash-due-badge').textContent = due.length;
  document.getElementById('dash-level-bar').style.width = goalPct + '%';
  document.getElementById('dash-level-label').textContent = goalDone
    ? '✓ Tagesziel erreicht – ' + count + ' Karten heute'
    : count + ' / ' + DAILY_GOAL + ' Karten heute';

  const days = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const now  = new Date();
  const row  = document.getElementById('streak-row');
  row.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d   = new Date(now);
    d.setDate(now.getDate() - i);
    const iso     = d.toISOString().split('T')[0];
    const dayName = days[(d.getDay() + 6) % 7];
    const done    = state.studyDays?.includes(iso);
    const isToday = (i === 0);
    const el = document.createElement('div');
    el.className = 'streak-day' + (done ? ' done' : '') + (isToday && !done ? ' today-marker' : '');
    el.textContent = dayName;
    row.appendChild(el);
  }
}

function getStreak() {
  if (!state.studyDays?.length) return 0;

  const studySet = new Set(state.studyDays);

  let streak = 0;
  let d = new Date();

  while (true) {
    const iso = d.toISOString().split('T')[0];

    if (studySet.has(iso)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// ══════════════════════════════════════════════
//  SESSION / LEARN
// ══════════════════════════════════════════════
let sessionQueue   = [];
let sessionIdx     = 0;
let sessionFlipped = false;
let sessionReviewed = 0;
let sessionCorrect  = 0;

function initLearnView() {
  // Restore the learn-content HTML in case showNoCards replaced it
  const lc = document.getElementById('learn-content');
  if (!document.getElementById('card-scene')) {
    lc.innerHTML = learnContentHTML();
  }
  document.getElementById('learn-content').style.display = 'block';
  document.getElementById('completion-screen').style.display = 'none';
  startSession();
}

function learnContentHTML() {
  return `
      <div class="learn-header">
        <button class="btn btn-ghost" style="width:auto;padding:9px 14px;font-size:0.8rem;" onclick="switchView('dashboard')">← Zurück</button>
        <div class="learn-progress">
          <div class="progress-bar-wrap" style="margin:0;">
            <div class="progress-bar-fill" id="learn-progress-bar" style="width:0%"></div>
          </div>
          <div class="progress-label" id="learn-progress-label">0 / 0</div>
        </div>
        <div class="daily-goal" id="daily-goal-counter">0 / 10 🎯</div>
      </div>
      <div class="card-scene" id="card-scene" onclick="flipCard()">
        <div class="card-inner" id="card-inner">
          <div class="card-face card-front">
            <div class="card-tag" id="card-tag">Spanisch</div>
            <div class="card-word" id="card-es">—</div>
            <div class="card-hint" id="card-hint"></div>
            <div class="card-tap-hint">Tippe zum Umdrehen</div>
          </div>
          <div class="card-face card-back">
            <div class="card-tag" id="card-tag-back" style="background:rgba(200,146,58,0.15);">Deutsch</div>
            <div class="card-translation" id="card-de">—</div>
            <div class="card-context" id="card-context"></div>
          </div>
        </div>
      </div>
      <div class="rating-section" id="rating-section">
        <div class="rating-label">Wie gut wusstest du es?</div>
        <div class="rating-buttons">
          <button class="rating-btn r-again" onclick="rateCard(0)">Nochmal<span class="next-review" id="next-again">—</span></button>
          <button class="rating-btn r-hard"  onclick="rateCard(1)">Schwer<span class="next-review" id="next-hard">—</span></button>
          <button class="rating-btn r-good"  onclick="rateCard(2)">Gut<span class="next-review" id="next-good">—</span></button>
          <button class="rating-btn r-easy"  onclick="rateCard(3)">Leicht<span class="next-review" id="next-easy">—</span></button>
        </div>
      </div>`;
}

function startSession() {
  const due = getDueCards();
  if (!due.length) {
    showNoCards();
    return;
  }

  sessionQueue = shuffle(due);
  sessionIdx = 0;
  sessionFlipped = false;
  sessionReviewed = 0;
  sessionCorrect = 0;

  document.getElementById('rating-section').classList.remove('visible');
  updateDailyGoalCounter();
  showCard();
}

function updateDailyGoalCounter() {
  const el = document.getElementById('daily-goal-counter');
  if (!el) return;
  const count = getTodayCount();
  const done  = count >= DAILY_GOAL;
  el.textContent = count + ' / ' + DAILY_GOAL + ' 🎯';
  el.className   = 'daily-goal' + (done ? ' done' : '');
}

function showCard() {
  if (sessionIdx >= sessionQueue.length) { endSession(); return; }
  const card = sessionQueue[sessionIdx];
  const isDE = card.direction === 'de';

  // Front / Back
  const frontWord = isDE ? card.de : card.es;
  const backWord  = isDE ? card.es : card.de;

  // Labels
  const frontLang = isDE ? 'Deutsch' : 'Spanisch';
  const backLang  = isDE ? 'Spanisch' : 'Deutsch';

  // optional Kontext nur auf Spanisch-Seite
  const backClass = isDE ? '' : 'card-translation';

  document.getElementById('card-es').textContent      = frontWord;
  document.getElementById('card-de').textContent      = backWord;
  document.getElementById('card-hint').textContent    = '';
  document.getElementById('card-context').textContent = isDE ? '' : (card.ctx || '');
  document.getElementById('card-tag').textContent     = frontLang;
  document.getElementById('card-tag-back').textContent = backLang;
  document.getElementById('card-inner').classList.remove('flipped');
  document.getElementById('rating-section').classList.remove('visible');
  sessionFlipped = false;

  const total = sessionQueue.length;
  document.getElementById('learn-progress-bar').style.width = Math.round(sessionIdx / total * 100) + '%';
  document.getElementById('learn-progress-label').textContent = sessionIdx + ' / ' + total;
}

function flipCard() {
  if (sessionFlipped) return;
  sessionFlipped = true;
  document.getElementById('card-inner').classList.add('flipped');
  document.getElementById('rating-section').classList.add('visible');
  const card = sessionQueue[sessionIdx];
  document.getElementById('next-again').textContent = intervalLabel(0, card, card.direction);
  document.getElementById('next-hard').textContent  = intervalLabel(1, card, card.direction);
  document.getElementById('next-good').textContent  = intervalLabel(2, card, card.direction);
  document.getElementById('next-easy').textContent  = intervalLabel(3, card, card.direction);
}

function rateCard(quality) {
  const item = sessionQueue[sessionIdx];
  const card = state.cards.find(c => c.id === item.id);

  const progress = card.progress[item.direction];

  sm2(progress, quality);

  // Daily tracking bleibt gleich
  const iso = todayISO();
  if (!state.todayCount) state.todayCount = {};
  state.todayCount[iso] = (state.todayCount[iso] || 0) + 1;

  if (!state.studyDays) state.studyDays = [];

  // Erst zur Streak zählen, wenn Tagesziel erreicht
  if (
    state.todayCount[iso] >= DAILY_GOAL &&
    !state.studyDays.includes(iso)
  ) {
    state.studyDays.push(iso);
  }

  saveData(state);

  sessionReviewed++;
  if (quality >= 2) sessionCorrect++;

  updateDailyGoalCounter();
  if (state.todayCount[iso] === DAILY_GOAL) showGoalToast();

  // Wiederholen bei "Nochmal"
  if (quality === 0) {
    const at = Math.min(sessionIdx + 4, sessionQueue.length);
    sessionQueue.splice(at, 0, item);
  }

  sessionIdx++;

  document.getElementById('rating-section').classList.remove('visible');
  document.getElementById('card-inner').classList.remove('flipped');
  document.getElementById('card-scene').style.pointerEvents = 'none';

  setTimeout(() => {
    document.getElementById('card-scene').style.pointerEvents = '';
    showCard();
  }, 200);
}

function showGoalToast() {
  const t = document.createElement('div');
  t.textContent = '🎉 Tagesziel erreicht!';
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);' +
    'background:var(--gold);color:var(--midnight);font-weight:700;font-size:0.9rem;' +
    'padding:12px 24px;border-radius:12px;z-index:999;pointer-events:none;' +
    'animation:fadeInUp 0.3s ease;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function showNoCards() {
  document.getElementById('learn-content').innerHTML = `
    <div class="no-cards-msg">
      <div class="icon">✨</div>
      <h2>Alles gelernt!</h2>
      <p>Keine Karten fällig. Komm morgen wieder – oder füge neue Vokabeln hinzu.</p>
      <br>
      <button class="btn btn-primary" onclick="switchView('import')">Vokabeln hinzufügen</button>
    </div>`;
}

function restartSession() {
  const lc = document.getElementById('learn-content');
  lc.innerHTML = learnContentHTML();
  document.getElementById('learn-content').style.display = 'block';
  document.getElementById('completion-screen').style.display = 'none';
  startSession();
}

function endSession() {
  const pct   = sessionReviewed > 0 ? Math.round(sessionCorrect / sessionReviewed * 100) : 0;
  const count = getTodayCount();
  document.getElementById('comp-reviewed').textContent    = sessionReviewed;
  document.getElementById('comp-correct').textContent     = pct + '%';
  document.getElementById('comp-time').textContent        = count + ' / ' + DAILY_GOAL;
  document.getElementById('comp-time-label').textContent  = 'Heute gesamt';
  document.getElementById('learn-content').style.display  = 'none';
  document.getElementById('completion-screen').style.display = 'block';
}

// ══════════════════════════════════════════════
//  VOCAB LIST
// ══════════════════════════════════════════════
let sortMode = 'due';

function sortVocab() {
  const modes = ['due', 'alpha', 'level'];
  sortMode = modes[(modes.indexOf(sortMode) + 1) % modes.length];
  renderVocab();
}

function renderVocab() {
  const q = (document.getElementById('vocab-search')?.value || '').toLowerCase();

  let rows = [];

  state.cards.forEach(card => {
    const directions = ['es', 'de'];

    directions.forEach(dir => {
      const p = card.progress[dir];

      const textEs = card.es.toLowerCase();
      const textDe = card.de.toLowerCase();

      if (
        textEs.includes(q) ||
        textDe.includes(q)
      ) {
        rows.push({
          card,
          dir,
          p
        });
      }
    });
  });

  if (sortMode === 'alpha') {
    rows.sort((a, b) => a.card.es.localeCompare(b.card.es));
  } else if (sortMode === 'level') {
    rows.sort((a, b) => (b.p.repetitions || 0) - (a.p.repetitions || 0));
  } else {
    rows.sort((a, b) => (a.p.nextReview || 0) - (b.p.nextReview || 0));
  }

  document.getElementById('vocab-count').textContent = rows.length;

  const list = document.getElementById('vocab-list');

  if (!rows.length) {
    list.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--text-light);">Keine Vokabeln gefunden.</div>';
    return;
  }

  list.innerHTML = rows.map(r => {
    const lvl = Math.min(5, r.p.repetitions || 0);
    const due = (r.p.nextReview && Date.now() >= r.p.nextReview)
      ? '🔔 Fällig'
      : nextReviewStr(r.card, r.dir);

    const front = r.dir === 'es' ? r.card.es : r.card.de;
    const back  = r.dir === 'es' ? r.card.de : r.card.es;

    return `
      <div class="vocab-item">
        <div class="level-dot level-${lvl}" title="Stufe ${lvl}"></div>
        <div class="es">${escHtml(front)} <span style="font-size:0.7rem;color:var(--text-light)">(${r.dir})</span></div>
        <div class="de">${escHtml(back)}<br><span style="font-size:0.7rem;color:var(--text-light);">${due}</span></div>
      </div>
    `;
  }).join('');
}

function nextReviewStr(card, direction) {
  const p = card.progress?.[direction];
  if (!p || !p.nextReview) return 'Neu';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = p.nextReview - today.getTime();
  const days = Math.round(diff / 86400000);

  if (days < 1) return 'Heute';
  if (days === 1) return 'Morgen';
  return 'in ' + days + ' Tagen';
}

function deleteCard(id) {
  if (!confirm('Karte löschen?')) return;
  state.cards = state.cards.filter(c => c.id !== id);
  saveData(state);
  renderVocab();
  renderDashboard();
}

// ══════════════════════════════════════════════
//  IMPORT
// ══════════════════════════════════════════════
function addSingleWord() {
  const es  = document.getElementById('single-es').value.trim();
  const de  = document.getElementById('single-de').value.trim();
  const ctx = document.getElementById('single-ctx').value.trim();
  if (!es || !de) { showFeedback('single-feedback', 'Bitte beide Felder ausfüllen.', 'error'); return; }
  addCard(es, de, ctx);
  document.getElementById('single-es').value  = '';
  document.getElementById('single-de').value  = '';
  document.getElementById('single-ctx').value = '';
  showFeedback('single-feedback', 'Karte hinzugefügt!', 'success');
  renderDashboard();
}

function importCSV() {
  const raw = document.getElementById('csv-input').value.trim();
  if (!raw) { showFeedback('csv-feedback', 'Bitte CSV-Inhalt einfügen.', 'error'); return; }
  let count = 0;
  raw.split('\n').filter(l => l.trim()).forEach(line => {
    const parts = line.split(',').map(p => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      addCard(parts[0], parts[1], parts[2] || '');
      count++;
    }
  });
  document.getElementById('csv-input').value = '';
  showFeedback('csv-feedback', count + ' Karte(n) importiert!', 'success');
  renderDashboard();
}

async function exportVocabs() {
  try {
    const csv = state.cards
      .map(card => [card.es, card.de, card.ctx || ""].join(","))
      .join("\n");

    await navigator.clipboard.writeText(csv);

    showFeedback('backup-feedback', `${state.cards.length} Vokabeln wurden als CSV in die Zwischenablage kopiert.`, 'success');
  } catch (err) {
    console.error(err);
    showFeedback('backup-feedback', "Konnte nicht in die Zwischenablage kopieren.", 'error');
  }
}

function addCard(es, de, ctx) {
  if (state.cards.find(c => c.es.toLowerCase() === es.toLowerCase())) return;

  state.cards.push({
    id: state.nextId++,
    es,
    de,
    ctx: ctx || '',

    progress: {
      es: {
        interval: 1,
        repetitions: 0,
        easeFactor: 2.5,
        nextReview: null,
        lastReviewed: null,
        totalReviews: 0,
        correctReviews: 0
      },

      de: {
        interval: 1,
        repetitions: 0,
        easeFactor: 2.5,
        nextReview: null,
        lastReviewed: null,
        totalReviews: 0,
        correctReviews: 0
      }
    },

    added: Date.now()
  });

  saveData(state);
}

function loadDemoData() {
  const demo = [
    ['hola', 'hallo'],
    ['adiós', 'tschüss / auf Wiedersehen'],
    ['por favor', 'bitte'],
    ['gracias', 'danke'],
    ['sí', 'ja'],
    ['no', 'nein'],
    ['buenos días', 'guten Morgen'],
    ['buenas tardes', 'guten Tag (nachmittags)'],
    ['buenas noches', 'gute Nacht'],
    ['¿cómo estás?', 'wie geht es dir?'],
    ['bien', 'gut'],
    ['mal', 'schlecht'],
    ['¿cómo te llamas?', 'wie heißt du?'],
    ['me llamo', 'ich heiße'],
    ['mucho gusto', 'freut mich (kennenzulernen)'],
    ['amigo / amiga', 'Freund / Freundin'],
    ['la familia', 'die Familie'],
    ['el padre', 'der Vater'],
    ['la madre', 'die Mutter'],
    ['el hermano', 'der Bruder'],
    ['la hermana', 'die Schwester'],
    ['el agua', 'das Wasser'],
    ['la comida', 'das Essen / die Speise'],
    ['el pan', 'das Brot'],
    ['la casa', 'das Haus'],
    ['el coche', 'das Auto'],
    ['la escuela', 'die Schule'],
    ['el libro', 'das Buch'],
    ['el tiempo', 'die Zeit / das Wetter'],
    ['hoy', 'heute'],
    ['mañana', 'morgen'],
    ['ayer', 'gestern'],
    ['el dinero', 'das Geld'],
    ['comprar', 'kaufen'],
    ['comer', 'essen'],
    ['beber', 'trinken'],
    ['hablar', 'sprechen'],
    ['escribir', 'schreiben'],
    ['leer', 'lesen'],
    ['hacer', 'machen / tun'],
    ['ir', 'gehen'],
    ['querer', 'wollen / lieben'],
    ['donde', 'wo'],
    ['cuando', 'wann'],
    ['por qué', 'warum'],
    ['qué', 'was'],
    ['quién', 'wer'],
    ['grande', 'groß'],
    ['pequeño', 'klein'],
    ['bonito', 'schön']
  ];
  demo.forEach(([es, de, ctx]) => addCard(es, de, ctx));
  showFeedback('csv-feedback', demo.length + ' Demo-Karten geladen!', 'success');
  renderDashboard();
}

function clearAllData() {
  if (!confirm('Alle Daten löschen? Das kann nicht rückgängig gemacht werden!')) return;
  state = defaultState();
  saveData(state);
  renderDashboard();
  renderVocab();
}

async function exportData() {
  try {
    const json = JSON.stringify(state, null, 2);

    const blob = new Blob([json], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `espanol-flow-backup-${todayISO()}.json`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    showFeedback("backup-feedback", "Backup erfolgreich exportiert.", "success");
  } catch (err) {
    console.error(err);
    showFeedback("backup-feedback", "Export fehlgeschlagen.", "error");
  }
}


async function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // einfache Validierung
      if (
        !data ||
        !Array.isArray(data.cards) ||
        typeof data.nextId !== "number"
      ) {
        throw new Error("Ungültige Datei");
      }

      state = data;

      await saveData(state);

      renderDashboard();
      renderVocab();

      showFeedback("backup-feedback", "Backup erfolgreich importiert.", "success");

    } catch (err) {
      console.error(err);
      showFeedback("backup-feedback", "Ungültige Backup-Datei.", "error");
    }
  };

  input.click();
}

// ══════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showFeedback(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className = 'feedback-msg ' + type + ' visible';
  setTimeout(() => el.classList.remove('visible'), 3000);
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
renderDashboard();
