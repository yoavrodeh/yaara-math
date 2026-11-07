'use strict';

const VERSION = 'v6';
const QUESTIONS_PER_SESSION = 10;
const TIME_CHOICES = [5, 10, 15, 20, 30];
const IDLE_BEEP_MS = 60 * 1000;
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

/** True if subtracting b from a needs at least one borrow. */
function needsBorrow(a, b) {
  for (; b > 0; a = Math.floor(a / 10), b = Math.floor(b / 10)) {
    if (a % 10 < b % 10) {
      return true;
    }
  }
  return false;
}

/** True if adding a and b carries in at least one column. */
function needsCarry(a, b) {
  for (; a > 0 || b > 0; a = Math.floor(a / 10), b = Math.floor(b / 10)) {
    if (a % 10 + b % 10 >= 10) {
      return true;
    }
  }
  return false;
}

/** True if multiplying a by the digit m carries somewhere. */
const mulCarries = (a, m) => [...String(a)].some(d => Number(d) * m >= 10);

// The long levels grow within a round: questions 1-3 use 2-digit numbers, 4-7 use 3, 8-10 use 4.
const longSize = index => (index < 3 ? 2 : index < 7 ? 3 : 4);

function longAdd(index) {
  const d = longSize(index);
  for (;;) {
    const a = nDigits(d);
    const b = nDigits(rand(2, d));
    if (needsCarry(a, b)) {
      return withSheet(add(...shuffle2(a, b)));
    }
  }
}

function longSub(index) {
  const d = longSize(index);
  for (;;) {
    const a = nDigits(d);
    const b = nDigits(rand(2, d));
    if (b < a && needsBorrow(a, b)) {
      return withSheet(sub(a, b));
    }
  }
}

/** 2-digit × 1-digit, then 3-digit × 1-digit, then 2-digit × 2-digit with two partial-product rows. */
function longMul(index) {
  if (index >= 7) {
    const b = nDigits(2);
    return b % 10 === 0 ? longMul(index) : withSheet(mul(nDigits(2), b));
  }
  for (;;) {
    const a = nDigits(index < 3 ? 2 : 3);
    const m = rand(3, 9);
    if (mulCarries(a, m)) {
      return withSheet(mul(a, m));
    }
  }
}

/** One-digit divisor, whole answer of at least 2 digits; the number divided grows from 2 to 4 digits. */
function longDiv(index) {
  const d = longSize(index);
  const divisor = rand(2, 9);
  const lo = Math.max(10, Math.ceil(10 ** (d - 1) / divisor));
  const hi = Math.floor((10 ** d - 1) / divisor);
  const q = div(divisor, rand(lo, hi));
  return { ...q, sheet: divisionSheet(q.a, divisor) };
}

const noZero = v => !String(v).includes('0');

/** Two-digit divisor: 1-digit answers first, then 2-digit, then 3-digit; no 0 digits in the answer. */
function longDiv2(index) {
  const digits = index < 7 ? 3 : 4;
  for (;;) {
    const divisor = rand(11, index < 7 ? 29 : 39);
    let quotient = rand(111, 999);
    if (index < 3) {
      quotient = rand(2, 9);
    } else if (index < 7) {
      quotient = rand(11, 99);
    }
    if (String(divisor * quotient).length === digits && noZero(quotient)) {
      const q = div(divisor, quotient);
      return { ...q, sheet: longDivisionSheet(q.a, divisor) };
    }
  }
}

const stackedSample = (a, sym, b) => `<span class="mini"><span>${a}</span><span class="mini-b">${sym} ${b}</span></span>`;
const divisionSample = (a, b) => `<span class="mini-div"><span>${b}</span><span class="mini-dd">${a}</span></span>`;

const OPS = {
  add: {
    name: 'Addition', sym: '+',
    levels: [
      { sample: '4 + 5', make: () => add(nDigits(1), nDigits(1)) },
      { sample: '37 + 48', make: () => add(nDigits(2), nDigits(2)) },
      { sample: '264 + 519', make: () => add(nDigits(3), nDigits(3)) },
      { sample: '3406 + 72', make: () => { const [x, y] = pick(MIXED_DIGITS); return add(...shuffle2(nDigits(x), nDigits(y))); } },
      { title: 'Long addition', sample: stackedSample(47, '+', 38), make: longAdd },
    ],
  },
  sub: {
    name: 'Subtraction', sym: '−',
    levels: [
      { sample: '9 − 4', make: () => sub(nDigits(1), nDigits(1)) },
      { sample: '74 − 38', make: () => sub(nDigits(2), nDigits(2)) },
      { sample: '612 − 347', make: () => sub(nDigits(3), nDigits(3)) },
      { sample: '3005 − 48', make: () => { const [x, y] = pick(MIXED_DIGITS); return sub(nDigits(x), nDigits(y)); } },
      { title: 'Long subtraction', sample: stackedSample(52, '−', 38), make: longSub },
    ],
  },
  mul: {
    name: 'Multiplication', sym: '×',
    levels: [
      { sample: '7 × 8', make: () => mul(rand(2, 9), rand(2, 9)) },
      { sample: '6 × 34', make: () => mul(...shuffle2(rand(2, 9), nDigits(2))) },
      { sample: '23 × 31', make: () => mul(rand(10, 39), rand(10, 39)) },
      { sample: '47 × 86', make: () => mul(nDigits(2), nDigits(2)) },
      { title: 'Long multiplication', sample: stackedSample(34, '×', 6), make: longMul },
    ],
  },
  div: {
    name: 'Division', sym: '÷',
    levels: [
      { sample: '56 ÷ 8', make: () => div(rand(2, 9), rand(2, 9)) },
      { sample: '84 ÷ 7', make: () => div(rand(2, 9), nDigits(2)) },
      { sample: '713 ÷ 23', make: () => div(rand(10, 39), rand(10, 39)) },
      { sample: '2752 ÷ 43', make: () => div(nDigits(2), nDigits(2)) },
      { title: 'Long division', sample: divisionSample(96, 4), make: longDiv },
      { title: 'Long division 2', sample: divisionSample(736, 23), make: longDiv2 },
    ],
  },
};

// Level 1 is the palest strawberry, later levels get riper.
const LEVEL_ICON_COLORS = ['#F5A3B7', '#F0849E', '#EA6587', '#D94F72', 'var(--lavender)', '#A792E0'];
const levelName = (op, i) => OPS[op].levels[i].title || `Level ${i + 1}`;

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
  gameRounds: [],
  hiddenMs: 0,
  hiddenSince: 0,
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
        <p class="small" style="margin-top:22px">${icon('berry', '', 'width:24px;height:24px;vertical-align:-5px;color:var(--berry)')} Points this game: ${fmt(S.gamePoints)}</p>
      </div>`;
  },

  levels() {
    const op = OPS[S.op];
    const rows = op.levels.map((lv, i) => {
      const best = store.best[`${S.op}-${i}`];
      return `
        <button class="level" data-act="level" data-v="${i}">
          ${icon('berry', '', `color:${LEVEL_ICON_COLORS[i]}`)}
          <span>${levelName(S.op, i)}</span>
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
          <span class="score">${icon('berry')}<span id="qscore"></span></span>
        </div>
        <div class="bar"><div id="qbar"></div></div>
        <div class="qbody">
          <div class="qleft">
            ${q.sheet ? sheetHTML(q) : `<div class="problem">${q.a} ${q.sym} ${q.b} = <span id="answer" class="answer"></span></div>`}
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
      const id = r === 'first' ? 'berry' : r === 'second' ? 'flower' : 'leaf';
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
        <h2>${OPS[op].name} · ${levelName(op, level)}</h2>
        <div class="big-score">${fmt(score)} / ${QUESTIONS_PER_SESSION}</div>
        <p class="sub" style="margin:6px 0 0">${msg}</p>
        ${newBest ? '<div class="badge">New best score!</div>' : ''}
        <div class="leaves">${leaves}</div>
        <div class="legend">
          <span>${icon('berry', '', 'color:var(--berry)')} first try</span>
          <span>${icon('flower', '', 'color:var(--pink)')} second try</span>
          <span>${icon('leaf', '', 'color:var(--ink-soft);opacity:.4')} missed</span>
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
          ${icon('flower', '', 'color:var(--pink)')}${icon('berry', '', 'color:var(--berry)')}${icon('flower', '', 'color:var(--lavender)')}
        </div>
        <h1>Time's up!</h1>
        <p class="sub">You answered ${S.gameAnswered} question${S.gameAnswered === 1 ? '' : 's'}</p>
        <div class="big-score">${fmt(S.gamePoints)} points</div>
        <p class="small">Points today: ${fmt(todayPoints())}</p>
        ${roundsHTML()}
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
      q = OPS[op].levels[level].make(questions.length);
      tries++;
    } while (seen.has(`${q.a}${q.sym}${q.b}`) && tries < 50);
    seen.add(`${q.a}${q.sym}${q.b}`);
    questions.push(q);
  }
  S.op = op;
  S.level = level;
  S.session = {
    questions, index: 0, tries: 0, input: '', results: [], score: 0, resolved: false, reveal: false,
    startedAt: Date.now(), hiddenAtStart: S.hiddenMs,
  };
  freshAnswer(S.session);
  go('question');
}

// ---------- worksheet ("long") questions ----------
// A worksheet question has `sheet`. She fills rows of boxes (`sheet.inputs`, keyed by row id), one digit per
// column. Only the `ans` row is scored; carry, remainder and partial-product rows are her working.
// Big rows fill right to left (left to right for a division's answer). After a digit in a small box
// (a carry or a remainder), the cursor goes back to where she was in the big rows.

const toDigits = (value, n) => String(value).padStart(n, ' ').split('').map(c => c.trim());

/** Addition, subtraction or multiplication written in columns. */
function columnSheet(sym, a, b) {
  const A = String(a);
  const B = String(b);
  const answer = sym === '+' ? a + b : sym === '−' ? a - b : a * b;
  const twoRow = sym === '×' && B.length > 1;
  let cols = A.length;
  if (sym === '+') {
    cols = Math.max(A.length, B.length) + 1;
  } else if (sym === '×') {
    cols = A.length + B.length;
  }
  const rows = [];
  const inputs = {};
  if (sym === '−') {
    rows.push({ type: 'marks' });
  } else {
    rows.push({ type: 'boxes', id: 'carry' });
    inputs.carry = { small: true };
  }
  rows.push({ type: 'num', text: A, borrow: sym === '−' });
  rows.push({ type: 'num', text: B, sign: sym });
  rows.push({ type: 'rule' });
  if (twoRow) {
    const ones = Number(B[B.length - 1]);
    const tens = Number(B[B.length - 2]);
    rows.push({ type: 'boxes', id: 'p1' }, { type: 'boxes', id: 'p2', sign: '+' }, { type: 'rule' });
    inputs.p1 = { solution: toDigits(a * ones, cols) };
    inputs.p2 = { solution: toDigits(a * tens * 10, cols) };
  }
  rows.push({ type: 'boxes', id: 'ans' });
  inputs.ans = { graded: true, solution: toDigits(answer, cols) };
  let hint = 'Tap a small box to write what you carry';
  if (sym === '−') {
    hint = 'Tap a top digit to borrow 10 for it';
  } else if (twoRow) {
    hint = 'Tap any box to write in it';
  }
  return { kind: 'column', cols, rows, inputs, start: twoRow ? 'p1' : 'ans', hint };
}

/** Long division by a one-digit divisor: answer on top, remainders written small beside each digit. */
function divisionSheet(dividend, divisor) {
  const D = String(dividend);
  const cols = D.length;
  const rems = [];
  let r = 0;
  for (let i = 0; i < cols; i++) {
    rems.push(i > 0 && r > 0 ? String(r) : '');
    r = (r * 10 + Number(D[i])) % divisor;
  }
  return {
    kind: 'division', cols, divisor, dividend: D, start: 'ans',
    inputs: {
      ans: { graded: true, ltr: true, solution: toDigits(dividend / divisor, cols) },
      rem: { small: true, ltr: true, solution: rems },
    },
  };
}

/**
 * Long division by a two-digit divisor, with all the working: under the number, each step's product,
 * a line, and what is left with the next digit brought down. The cursor follows the steps in order:
 * answer digit, product (right to left), what is left (left to right), next answer digit.
 */
function longDivisionSheet(dividend, divisor) {
  const D = String(dividend);
  const n = D.length;
  /** A row of boxes holding value, ending at column `to`. */
  const place = (value, to, ltr = false) => {
    const t = String(value);
    const from = to - t.length + 1;
    const solution = Array(n).fill('');
    [...t].forEach((ch, k) => { solution[from + k] = ch; });
    return { from, to, ltr, solution };
  };
  let c = 0;
  let part = Number(D[0]);
  while (part < divisor) {
    c++;
    part = part * 10 + Number(D[c]);
  }
  const first = c;
  const steps = [];
  for (;;) {
    const prod = Math.floor(part / divisor) * divisor;
    const last = c === n - 1;
    const left = last ? part - prod : (part - prod) * 10 + Number(D[c + 1]);
    steps.push({ c, prod: place(prod, c), rem: place(left, last ? c : c + 1, true) });
    if (last) {
      break;
    }
    c++;
    part = left;
  }
  const inputs = { ans: { graded: true, ltr: true, from: first, to: n - 1, solution: toDigits(dividend / divisor, n) } };
  const next = {};
  steps.forEach((st, j) => {
    inputs[`p${j}`] = st.prod;
    inputs[`r${j}`] = st.rem;
    next[`ans:${st.c}`] = { id: `p${j}`, i: st.prod.to };
    next[`p${j}:${st.prod.from}`] = { id: `r${j}`, i: st.rem.from };
    if (j + 1 < steps.length) {
      next[`r${j}:${st.rem.to}`] = { id: 'ans', i: steps[j + 1].c };
    }
  });
  return { kind: 'longdiv', cols: n, divisor, dividend: D, inputs, steps, next, start: 'ans' };
}

function longDivHTML(sh) {
  const n = sh.cols;
  const gc = i => i + 2;
  const cell = (row, i) => `grid-row:${row};grid-column:${gc(i)}`;
  const out = [];
  for (let i = sh.inputs.ans.from; i < n; i++) {
    out.push(boxHTML('ans', i, false, cell(1, i)));
  }
  out.push(`<div class="divisor" style="grid-row:2;grid-column:1">${sh.divisor}</div>`);
  out.push(`<div class="bracket" style="grid-row:2;grid-column:2 / ${n + 2}"></div>`);
  for (let i = 0; i < n; i++) {
    out.push(`<div class="dd2" style="${cell(2, i)}">${sh.dividend[i]}</div>`);
  }
  sh.steps.forEach((st, j) => {
    const row = 3 + 3 * j;
    const p = st.prod;
    const r = st.rem;
    out.push(`<div class="sign" style="grid-row:${row};grid-column:${gc(p.from) - 1}">−</div>`);
    for (let i = p.from; i <= p.to; i++) {
      out.push(boxHTML(`p${j}`, i, false, cell(row, i)));
    }
    out.push(`<div class="drule" style="grid-row:${row + 1};grid-column:${gc(p.from)} / ${gc(p.to) + 1}"></div>`);
    for (let i = r.from; i <= r.to; i++) {
      out.push(boxHTML(`r${j}`, i, false, cell(row + 2, i)));
    }
  });
  return `<div id="longgrid" class="ldiv2" style="--n:${n}">${out.join('')}</div><p class="hint">Tap any box to write in it</p>`;
}

const withSheet = q => ({ ...q, sheet: columnSheet(q.sym, q.a, q.b) });

/** The columns a row of boxes covers (rows of a long division's working are shorter than the sheet). */
function span(sh, id) {
  const inp = sh.inputs[id];
  return [inp.from ?? 0, inp.to ?? sh.cols - 1];
}

/** Where typing starts in a row: its right end, or its left end for a division's answer. */
function firstCell(sh, id) {
  const [lo, hi] = span(sh, id);
  return sh.inputs[id].ltr ? lo : hi;
}

function freshAnswer(s) {
  const q = s.questions[s.index];
  s.input = '';
  s.cells = null;
  s.borrow = null;
  const sh = q.sheet;
  if (sh) {
    s.cells = {};
    for (const id of Object.keys(sh.inputs)) {
      s.cells[id] = Array(sh.cols).fill('');
    }
    s.cur = { id: sh.start, i: firstCell(sh, sh.start) };
    s.home = { ...s.cur };
    s.borrow = Array(sh.cols).fill(false);
  }
}

/** Clears the answer row for a second try; her working stays. */
function clearDigits(s) {
  s.input = '';
  if (s.cells) {
    const sh = s.questions[s.index].sheet;
    s.cells.ans.fill('');
    s.cur = { id: 'ans', i: firstCell(sh, 'ans') };
    s.home = { ...s.cur };
  }
}

/** The number in a row of boxes, or null if it is empty or has a gap. */
function rowValue(cells) {
  const filled = cells.map(c => c !== '');
  const first = filled.indexOf(true);
  if (first === -1 || filled.slice(first).includes(false)) {
    return null;
  }
  return Number(cells.slice(first).join(''));
}

function typeInSheet(s, d) {
  const sh = s.questions[s.index].sheet;
  const inp = sh.inputs[s.cur.id];
  const jump = sh.next && sh.next[`${s.cur.id}:${s.cur.i}`];
  s.cells[s.cur.id][s.cur.i] = d;
  if (inp.small) {
    s.cur = { ...s.home };
    return;
  }
  const [lo, hi] = span(sh, s.cur.id);
  if (jump) {
    s.cur = { ...jump };
  } else {
    s.cur.i = inp.ltr ? Math.min(hi, s.cur.i + 1) : Math.max(lo, s.cur.i - 1);
  }
  s.home = { ...s.cur };
}

function deleteInSheet(s) {
  const sh = s.questions[s.index].sheet;
  const inp = sh.inputs[s.cur.id];
  const row = s.cells[s.cur.id];
  if (row[s.cur.i] !== '') {
    row[s.cur.i] = '';
  } else if (!inp.small) {
    // Undo the last digit: step back and clear it.
    const back = inp.ltr ? s.cur.i - 1 : s.cur.i + 1;
    const [lo, hi] = span(sh, s.cur.id);
    if (back >= lo && back <= hi) {
      s.cur.i = back;
      row[back] = '';
    }
  }
  if (!inp.small) {
    s.home = { ...s.cur };
  }
}

function selectCell(s, id, i) {
  s.cur = { id, i };
  if (!s.questions[s.index].sheet.inputs[id].small) {
    s.home = { ...s.cur };
  }
}

/** What the top digit of column i is worth after borrowing (subtraction). */
function topValue(s, i) {
  const d = Number(String(s.questions[s.index].a)[i]);
  const lent = i + 1 < s.borrow.length && s.borrow[i + 1];
  return d + (s.borrow[i] ? 10 : 0) - (lent ? 1 : 0);
}

function toggleBorrow(s, i) {
  if (i === 0) {
    return;
  }
  if (s.borrow[i]) {
    s.borrow[i] = false;
    return;
  }
  s.borrow[i] = true;
  // Borrowing from a 0 means that column has to borrow too.
  for (let j = i - 1; j > 0 && topValue(s, j) < 0; j--) {
    s.borrow[j] = true;
  }
}

const boxHTML = (id, i, small, style = '') =>
  `<button class="${small ? 'sbox' : 'box'}" style="${style}" data-act="cell" data-v="${id}:${i}" id="${id}${i}"></button>`;

function sheetHTML(q) {
  const sh = q.sheet;
  const cols = [...Array(sh.cols).keys()];
  if (sh.kind === 'longdiv') {
    return longDivHTML(sh);
  }
  if (sh.kind === 'division') {
    return `
      <div id="longgrid" class="ldiv">
        <div></div>
        <div class="qrow">${cols.map(i => boxHTML('ans', i, false)).join('')}</div>
        <div class="divisor">${sh.divisor}</div>
        <div class="drow">${cols.map(i => `<div class="dd">${i > 0 ? boxHTML('rem', i, true) : ''}${sh.dividend[i]}</div>`).join('')}</div>
      </div>
      <p class="hint">Tap a small box to write what's left over</p>`;
  }
  const html = sh.rows.map(row => {
    if (row.type === 'rule') {
      return '<div class="rule"></div>';
    }
    if (row.type === 'marks') {
      return `<div></div>${cols.map(i => `<div class="carry" id="mark${i}"></div>`).join('')}`;
    }
    const sign = `<div class="sign">${row.sign || ''}</div>`;
    if (row.type === 'boxes') {
      return sign + cols.map(i => boxHTML(row.id, i, sh.inputs[row.id].small)).join('');
    }
    const t = row.text.padStart(sh.cols, ' ');
    return sign + cols.map(i => {
      if (t[i] === ' ') {
        return '<div></div>';
      }
      return row.borrow ? `<button class="topd" data-act="borrow" data-v="${i}" id="top${i}">${t[i]}</button>` : `<div>${t[i]}</div>`;
    }).join('');
  }).join('');
  const tall = sh.rows.length > 6 ? ' tall' : '';
  return `<div id="longgrid" class="long${tall}" style="--n:${sh.cols + 1}">${html}</div><p class="hint">${sh.hint}</p>`;
}

function updateSheetUI(s, q) {
  const sh = q.sheet;
  for (const [id, inp] of Object.entries(sh.inputs)) {
    const shown = s.reveal && inp.solution ? inp.solution : s.cells[id];
    for (let i = 0; i < sh.cols; i++) {
      const el = document.getElementById(`${id}${i}`);
      if (!el) {
        continue;
      }
      el.textContent = shown[i];
      let cls = inp.small ? 'sbox' : 'box';
      if (s.reveal && inp.solution) {
        cls += ' reveal';
      } else if (s.resolved && inp.graded) {
        cls += ' right';
      } else if (!s.resolved && s.cur.id === id && s.cur.i === i) {
        cls += ' cur';
      }
      el.className = cls;
    }
  }
  for (let i = 0; i < sh.cols; i++) {
    const mark = document.getElementById(`mark${i}`);
    if (mark) {
      const changed = s.borrow[i] || (i + 1 < sh.cols && s.borrow[i + 1]);
      document.getElementById(`top${i}`).classList.toggle('crossed', changed);
      mark.textContent = changed ? topValue(s, i) : '';
    }
  }
}

function updateQuestionUI(feedback) {
  const s = S.session;
  document.getElementById('qnum').textContent = `Question ${s.index + 1} of ${QUESTIONS_PER_SESSION}`;
  document.getElementById('qscore').textContent = fmt(s.score);
  document.getElementById('qbar').style.width = `${(s.results.length / QUESTIONS_PER_SESSION) * 100}%`;

  const q = s.questions[s.index];
  if (q.sheet) {
    updateSheetUI(s, q);
  } else {
    const ans = document.getElementById('answer');
    if (s.reveal) {
      ans.textContent = q.answer;
      ans.className = 'answer reveal';
    } else {
      ans.textContent = s.input || '?';
      ans.className = `answer${s.input ? '' : ' empty'}${s.resolved ? ' right' : ''}`;
    }
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
  const ans = document.getElementById('answer') || document.getElementById('longgrid');
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
  const q = s.questions[s.index];
  const entry = q.sheet ? rowValue(s.cells.ans) : (s.input ? Number(s.input) : null);
  if (entry === null) {
    shake();
    return;
  }
  if (entry === q.answer) {
    const pts = s.tries === 0 ? 1 : 0.5;
    resolve(pts, s.tries === 0 ? 'first' : 'second');
    updateQuestionUI({ good: true, html: `${icon('berry', '', 'color:var(--berry)')} ${pick(PRAISE)} +${fmt(pts)}` });
    advanceTimeout = setTimeout(nextQuestion, 1200);
  } else if (s.tries === 0) {
    s.tries = 1;
    clearDigits(s);
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
  freshAnswer(s);
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
  recordRound(s, complete);
  S.lastSummary = { score: s.score, results: s.results, newBest, op: S.op, level: S.level };
  S.session = null;
  go(complete ? 'summary' : 'timeup');
}

/** Adds a round (finished, stopped, or cut off by the timer) to this game's list and to the saved history. */
function recordRound(s, complete) {
  const secs = Math.round((Date.now() - s.startedAt - (S.hiddenMs - s.hiddenAtStart)) / 1000);
  const round = { op: S.op, level: S.level, score: s.score, answered: s.results.length, secs, complete };
  S.gameRounds.push(round);
  store.sessions.push({
    date: todayKey(), op: S.op, level: levelName(S.op, S.level), score: s.score,
    answered: s.results.length, secs, complete,
  });
  if (store.sessions.length > 1000) {
    store.sessions.splice(0, store.sessions.length - 1000);
  }
  saveStore();
}

const mmss = secs => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

function roundsHTML() {
  if (S.gameRounds.length === 0) {
    return '';
  }
  const rows = S.gameRounds.map((r, i) => `
    <div class="round">
      <span class="rnum">${i + 1}</span>
      <span class="rname">${OPS[r.op].name} · ${levelName(r.op, r.level)}${r.complete ? '' : ' <span class="rtag">unfinished</span>'}</span>
      <span class="rscore">${fmt(r.score)} / ${r.complete ? QUESTIONS_PER_SESSION : r.answered}</span>
      <span class="rtime">${mmss(r.secs)}</span>
    </div>`).join('');
  return `<div class="rounds">${rows}</div>`;
}

// ---------- timer ----------

function timeLeft() {
  return S.pausedLeft !== null ? S.pausedLeft : Math.max(0, S.endAt - Date.now());
}

function tick() {
  checkIdle();
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

// ---------- idle beeping ----------
// A minute with no tap or key during a game starts a short beep every second, until she touches the screen.
// Browsers only allow sound after a tap, so the sound is switched on by her first tap.

let lastActive = Date.now();
let lastBeep = 0;
let audio = null;

function wake() {
  lastActive = Date.now();
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') {
      audio.resume();
    }
  } catch {
    audio = null;
  }
}
document.addEventListener('pointerdown', wake, true);
document.addEventListener('keydown', wake, true);

function beep() {
  if (!audio) {
    return;
  }
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.3);
}

const PLAYING_SCREENS = ['ops', 'levels', 'question', 'summary'];

function checkIdle() {
  const now = Date.now();
  const idle = PLAYING_SCREENS.includes(S.screen) && !document.hidden && now - lastActive >= IDLE_BEEP_MS;
  document.body.classList.toggle('idle', idle);
  if (idle && now - lastBeep >= 1000) {
    lastBeep = now;
    beep();
  }
}

// Pause the clock while the app is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    S.hiddenSince = Date.now();
  } else {
    if (S.hiddenSince) {
      S.hiddenMs += Date.now() - S.hiddenSince;
      S.hiddenSince = 0;
    }
    lastActive = Date.now();
  }
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
      S.gameRounds = [];
      go('ops');
      tick();
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
      if (s && s.results.length > 0) {
        recordRound(s, false);
      }
      S.session = null;
      go('levels');
      break;
    case 'digit':
      if (!s || s.resolved) {
        break;
      }
      if (s.cells) {
        typeInSheet(s, v);
      } else if (s.input.length < MAX_ANSWER_DIGITS) {
        s.input = s.input === '0' ? v : s.input + v;
      }
      updateQuestionUI();
      break;
    case 'del':
      if (!s || s.resolved) {
        break;
      }
      if (s.cells) {
        deleteInSheet(s);
      } else {
        s.input = s.input.slice(0, -1);
      }
      updateQuestionUI();
      break;
    case 'cell':
      if (s && s.cells && !s.resolved) {
        const [id, i] = v.split(':');
        selectCell(s, id, Number(i));
        updateQuestionUI();
      }
      break;
    case 'borrow':
      if (s && s.borrow && !s.resolved) {
        toggleBorrow(s, Number(v));
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
