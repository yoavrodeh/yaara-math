'use strict';

const VERSION = 'v1';
const QUESTIONS_PER_SESSION = 10;
const TIME_CHOICES = [5, 10, 15, 20];
const MAX_ANSWER_DIGITS = 6;
const STORE_KEY = 'yaara-math';

// ---------- question generators ----------

const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = arr => arr[rand(0, arr.length - 1)];
const nDigits = n => (n === 1 ? rand(1, 9) : rand(10 ** (n - 1), 10 ** n - 1));
const shuffle2 = (a, b) => (Math.random() < 0.5 ? [a, b] : [b, a]);

const add = (a, b) => ({ a, b, sym: '+', answer: a + b });
const sub = (a, b) => ({ a: Math.max(a, b), b: Math.min(a, b), sym: '−', answer: Math.abs(a - b) });
const mul = (a, b) => ({ a, b, sym: '×', answer: a * b });
const div = (divisor, quotient) => ({ a: divisor * quotient, b: divisor, sym: '÷', answer: quotient });

// Digit counts for the "mixed" levels: [longer, shorter].
const MIXED_DIGITS = [[4, 1], [4, 2], [4, 3], [3, 1], [3, 2]];

const OPS = {
  add: {
    name: 'Addition', sym: '+',
    levels: [
      { sample: '4 + 5', make: () => add(nDigits(1), nDigits(1)) },
      { sample: '37 + 48', make: () => add(nDigits(2), nDigits(2)) },
      { sample: '264 + 519', make: () => add(nDigits(3), nDigits(3)) },
      { sample: '3406 + 72', make: () => { const [x, y] = pick(MIXED_DIGITS); return add(...shuffle2(nDigits(x), nDigits(y))); } },
    ],
  },
  sub: {
    name: 'Subtraction', sym: '−',
    levels: [
      { sample: '9 − 4', make: () => sub(nDigits(1), nDigits(1)) },
      { sample: '74 − 38', make: () => sub(nDigits(2), nDigits(2)) },
      { sample: '612 − 347', make: () => sub(nDigits(3), nDigits(3)) },
      { sample: '3005 − 48', make: () => { const [x, y] = pick(MIXED_DIGITS); return sub(nDigits(x), nDigits(y)); } },
    ],
  },
  mul: {
    name: 'Multiplication', sym: '×',
    levels: [
      { sample: '7 × 8', make: () => mul(rand(2, 9), rand(2, 9)) },
      { sample: '6 × 34', make: () => mul(...shuffle2(rand(2, 9), nDigits(2))) },
      { sample: '23 × 31', make: () => mul(rand(10, 39), rand(10, 39)) },
      { sample: '47 × 86', make: () => mul(nDigits(2), nDigits(2)) },
    ],
  },
  div: {
    name: 'Division', sym: '÷',
    levels: [
      { sample: '56 ÷ 8', make: () => div(rand(2, 9), rand(2, 9)) },
      { sample: '84 ÷ 7', make: () => div(rand(2, 9), nDigits(2)) },
      { sample: '713 ÷ 23', make: () => div(rand(10, 39), rand(10, 39)) },
      { sample: '2752 ÷ 43', make: () => div(nDigits(2), nDigits(2)) },
    ],
  },
};

const LEVEL_ICON_COLORS = ['var(--mustard)', 'var(--orange)', 'var(--red)', 'var(--brown)'];

// ---------- saved progress ----------

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
const store = Object.assign({ days: {}, best: {}, sessions: [] }, loadStore());

function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage unavailable: the game still works, it just won't remember.
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayPoints = () => store.days[todayKey()] || 0;

function addPoints(p) {
  if (p > 0) {
    store.days[todayKey()] = todayPoints() + p;
    saveStore();
  }
}

/** 7.5 -> "7½", 0.5 -> "½" */
function fmt(p) {
  const whole = Math.floor(p);
  const half = p - whole >= 0.5;
  if (!half) {
    return String(whole);
  }
  return whole === 0 ? '½' : `${whole}½`;
}

// ---------- state ----------

const S = {
  screen: 'start',
  minutes: 10,
  endAt: 0,
  pausedLeft: null,
  timeUp: false,
  gamePoints: 0,
  gameAnswered: 0,
  op: null,
  level: 0,
  session: null,
  lastSummary: null,
};

const app = document.getElementById('app');
const timerEl = document.getElementById('timer');
let advanceTimeout = null;

const icon = (id, cls = '', style = '') => `<svg class="${cls}" style="${style}" aria-hidden="true"><use href="#${id}"/></svg>`;

// ---------- screens ----------

const screens = {
  start() {
    const chips = TIME_CHOICES.map(m =>
      `<button class="chip ${m === S.minutes ? 'on' : ''}" data-act="minutes" data-v="${m}">${m} min</button>`).join('');
    const today = todayPoints();
    return `
      <div class="screen">
        <h1>Yaara's Math</h1>
        <p class="sub">How long do we play today?</p>
        <div class="chips">${chips}</div>
        <button class="btn" data-act="begin">Let's go</button>
        ${today > 0 ? `<p class="small" style="margin-top:28px">Points today: ${fmt(today)}</p>` : ''}
      </div>
      <div class="version">${VERSION}</div>`;
  },

  ops() {
    const cards = Object.entries(OPS).map(([key, op]) =>
      `<button class="op c-${key}" data-act="op" data-v="${key}"><b>${op.sym}</b>${op.name}</button>`).join('');
    return `
      <div class="screen">
        <h2>What shall we practice?</h2>
        <div class="ops">${cards}</div>
        <p class="small" style="margin-top:22px">${icon('flower', '', 'width:22px;height:22px;vertical-align:-4px;color:var(--mustard)')} Points this game: ${fmt(S.gamePoints)}</p>
      </div>`;
  },

  levels() {
    const op = OPS[S.op];
    const rows = op.levels.map((lv, i) => {
      const best = store.best[`${S.op}-${i}`];
      return `
        <button class="level" data-act="level" data-v="${i}">
          ${icon('leaf', '', `color:${LEVEL_ICON_COLORS[i]}`)}
          <span>Level ${i + 1}</span>
          <span class="ex">${lv.sample}</span>
          <span class="best">${best !== undefined ? `best ${fmt(best)}` : ''}</span>
        </button>`;
    }).join('');
    return `
      <button class="back" data-act="go" data-v="ops">← Back</button>
      <div class="screen">
        <h2>${op.name}</h2>
        <div class="levels">${rows}</div>
      </div>`;
  },

  question() {
    const s = S.session;
    const q = s.questions[s.index];
    return `
      <button class="back" data-act="quit">✕</button>
      <div class="screen">
        <div class="qtop">
          <span id="qnum"></span>
          <span class="score">${icon('flower')}<span id="qscore"></span></span>
        </div>
        <div class="bar"><div id="qbar"></div></div>
        <div class="qbody">
          <div class="qleft">
            <div class="problem">${q.a} ${q.sym} ${q.b} = <span id="answer" class="answer"></span></div>
            <div id="feedback" class="feedback"></div>
          </div>
          <div class="pad">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button class="key" data-act="digit" data-v="${d}">${d}</button>`).join('')}
            <button class="key del" data-act="del" aria-label="Delete">⌫</button>
            <button class="key" data-act="digit" data-v="0">0</button>
            <button id="go" class="key go" data-act="check">Check</button>
          </div>
        </div>
      </div>`;
  },

  summary() {
    const { score, results, newBest, op, level } = S.lastSummary;
    const leaves = Array.from({ length: QUESTIONS_PER_SESSION }, (_, i) => {
      const r = results[i] || 'none';
      const id = r === 'first' ? 'maple' : 'leaf';
      return icon(id, r);
    }).join('');
    let msg;
    if (score === QUESTIONS_PER_SESSION) {
      msg = 'Perfect! Every single one!';
    } else if (score >= 8) {
      msg = 'Wonderful work!';
    } else if (score >= 5) {
      msg = 'Good job, keep going!';
    } else {
      msg = 'Nice try! Practice makes perfect.';
    }
    return `
      <div class="screen">
        <h2>${OPS[op].name} · Level ${level + 1}</h2>
        <div class="big-score">${fmt(score)} / ${QUESTIONS_PER_SESSION}</div>
        <p class="sub" style="margin:6px 0 0">${msg}</p>
        ${newBest ? '<div class="badge">New best score!</div>' : ''}
        <div class="leaves">${leaves}</div>
        <div class="legend">
          <span>${icon('maple', '', 'color:var(--mustard)')} first try</span>
          <span>${icon('leaf', '', 'color:var(--orange)')} second try</span>
          <span>${icon('leaf', '', 'color:var(--brown);opacity:.45')} missed</span>
        </div>
        <div class="btn-row">
          <button class="btn" data-act="level" data-v="${level}">Play again</button>
          <button class="btn alt" data-act="go" data-v="levels">Other level</button>
          <button class="btn alt" data-act="go" data-v="ops">Other topic</button>
        </div>
      </div>`;
  },

  timeup() {
    return `
      <div class="screen">
        <div class="bloom">
          ${icon('flower', '', 'color:var(--orange)')}${icon('maple', '', 'color:var(--red)')}${icon('flower', '', 'color:var(--mustard)')}
        </div>
        <h1>Time's up!</h1>
        <p class="sub">You answered ${S.gameAnswered} question${S.gameAnswered === 1 ? '' : 's'}</p>
        <div class="big-score">${fmt(S.gamePoints)} points</div>
        <p class="small">Points today: ${fmt(todayPoints())}</p>
        <div class="btn-row">
          <button class="btn" data-act="go" data-v="start">Play again</button>
        </div>
      </div>`;
  },
};

function go(screen) {
  clearTimeout(advanceTimeout);
  if (S.timeUp && ['ops', 'levels', 'question'].includes(screen)) {
    screen = 'timeup';
  }
  S.screen = screen;
  app.innerHTML = screens[screen]();
  timerEl.classList.toggle('hidden', screen === 'start');
  if (screen === 'question') {
    updateQuestionUI();
  }
}

// ---------- sessions ----------

function startSession(op, level) {
  const seen = new Set();
  const questions = [];
  while (questions.length < QUESTIONS_PER_SESSION) {
    let q;
    let tries = 0;
    do {
      q = OPS[op].levels[level].make();
      tries++;
    } while (seen.has(`${q.a}${q.sym}${q.b}`) && tries < 50);
    seen.add(`${q.a}${q.sym}${q.b}`);
    questions.push(q);
  }
  S.op = op;
  S.level = level;
  S.session = { questions, index: 0, tries: 0, input: '', results: [], score: 0, resolved: false, reveal: false };
  go('question');
}

function updateQuestionUI(feedback) {
  const s = S.session;
  document.getElementById('qnum').textContent = `Question ${s.index + 1} of ${QUESTIONS_PER_SESSION}`;
  document.getElementById('qscore').textContent = fmt(s.score);
  document.getElementById('qbar').style.width = `${(s.results.length / QUESTIONS_PER_SESSION) * 100}%`;

  const ans = document.getElementById('answer');
  const q = s.questions[s.index];
  if (s.reveal) {
    ans.textContent = q.answer;
    ans.className = 'answer reveal';
  } else {
    ans.textContent = s.input || '?';
    ans.className = `answer${s.input ? '' : ' empty'}${s.resolved ? ' right' : ''}`;
  }

  const goBtn = document.getElementById('go');
  const showNext = s.resolved && s.reveal;
  goBtn.textContent = showNext ? 'Next' : 'Check';
  goBtn.classList.toggle('next', showNext);

  if (feedback !== undefined) {
    const fb = document.getElementById('feedback');
    fb.innerHTML = feedback.html;
    fb.className = `feedback ${feedback.good ? 'good' : ''}`;
    void fb.offsetWidth;
    fb.classList.add('pop');
  }
}

function shake() {
  const ans = document.getElementById('answer');
  ans.classList.remove('shake');
  void ans.offsetWidth;
  ans.classList.add('shake');
}

const PRAISE = ['Great!', 'Wonderful!', 'Yes!', 'Super!', 'Brilliant!', 'Well done!', 'Amazing!'];

function check() {
  const s = S.session;
  if (s.resolved) {
    if (s.reveal) {
      nextQuestion();
    }
    return;
  }
  if (!s.input) {
    shake();
    return;
  }
  const q = s.questions[s.index];
  if (Number(s.input) === q.answer) {
    const pts = s.tries === 0 ? 1 : 0.5;
    resolve(pts, s.tries === 0 ? 'first' : 'second');
    updateQuestionUI({ good: true, html: `${icon('flower', '', 'color:var(--mustard)')} ${pick(PRAISE)} +${fmt(pts)}` });
    advanceTimeout = setTimeout(nextQuestion, 1200);
  } else if (s.tries === 0) {
    s.tries = 1;
    s.input = '';
    updateQuestionUI({ good: false, html: 'Almost! Try once more' });
    shake();
  } else {
    s.reveal = true;
    resolve(0, 'missed');
    updateQuestionUI({ good: true, html: `The answer is ${q.answer}` });
  }
}

function resolve(points, result) {
  const s = S.session;
  s.resolved = true;
  s.results.push(result);
  s.score += points;
  S.gamePoints += points;
  S.gameAnswered += 1;
  addPoints(points);
}

function nextQuestion() {
  clearTimeout(advanceTimeout);
  const s = S.session;
  if (s.index + 1 >= QUESTIONS_PER_SESSION) {
    finishSession(true);
    return;
  }
  if (S.timeUp) {
    finishSession(false);
    return;
  }
  s.index += 1;
  s.tries = 0;
  s.input = '';
  s.resolved = false;
  s.reveal = false;
  go('question');
}

function finishSession(complete) {
  const s = S.session;
  const key = `${S.op}-${S.level}`;
  const newBest = complete && (store.best[key] === undefined || s.score > store.best[key]);
  if (newBest) {
    store.best[key] = s.score;
  }
  store.sessions.push({ date: todayKey(), op: S.op, level: S.level + 1, score: s.score, answered: s.results.length });
  if (store.sessions.length > 1000) {
    store.sessions.splice(0, store.sessions.length - 1000);
  }
  saveStore();
  S.lastSummary = { score: s.score, results: s.results, newBest, op: S.op, level: S.level };
  S.session = null;
  go(complete ? 'summary' : 'timeup');
}

// ---------- timer ----------

function timeLeft() {
  return S.pausedLeft !== null ? S.pausedLeft : Math.max(0, S.endAt - Date.now());
}

function tick() {
  if (S.screen === 'start') {
    return;
  }
  const left = timeLeft();
  const secs = Math.ceil(left / 1000);
  timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  timerEl.classList.toggle('low', secs > 0 && secs <= 60);
  timerEl.classList.toggle('done', secs === 0);
  if (left <= 0 && !S.timeUp) {
    S.timeUp = true;
    // Let her finish the question she's on; otherwise end the game now.
    if (S.screen === 'ops' || S.screen === 'levels') {
      go('timeup');
    }
  }
}
setInterval(tick, 250);

// Pause the clock while the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (S.screen === 'start' || S.screen === 'timeup' || S.timeUp) {
    return;
  }
  if (document.hidden) {
    S.pausedLeft = Math.max(0, S.endAt - Date.now());
  } else if (S.pausedLeft !== null) {
    S.endAt = Date.now() + S.pausedLeft;
    S.pausedLeft = null;
  }
});

// ---------- input ----------

function press(act, v) {
  const s = S.session;
  switch (act) {
    case 'minutes':
      S.minutes = Number(v);
      go('start');
      break;
    case 'begin':
      S.endAt = Date.now() + S.minutes * 60 * 1000;
      S.pausedLeft = null;
      S.timeUp = false;
      S.gamePoints = 0;
      S.gameAnswered = 0;
      tick();
      go('ops');
      break;
    case 'go':
      go(v);
      break;
    case 'op':
      S.op = v;
      go('levels');
      break;
    case 'level':
      startSession(S.op, Number(v));
      break;
    case 'quit':
      S.session = null;
      go('levels');
      break;
    case 'digit':
      if (s && !s.resolved && s.input.length < MAX_ANSWER_DIGITS) {
        s.input = s.input === '0' ? v : s.input + v;
        updateQuestionUI();
      }
      break;
    case 'del':
      if (s && !s.resolved) {
        s.input = s.input.slice(0, -1);
        updateQuestionUI();
      }
      break;
    case 'check':
      if (s) {
        check();
      }
      break;
  }
}

app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) {
    press(el.dataset.act, el.dataset.v);
  }
});

document.addEventListener('keydown', e => {
  if (S.screen !== 'question') {
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    press('digit', e.key);
  } else if (e.key === 'Backspace') {
    press('del');
  } else if (e.key === 'Enter') {
    press('check');
  }
});

// ---------- go ----------

go('start');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
