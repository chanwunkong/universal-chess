// 無盡征途：關卡、戰場、商店與存檔（設計見 design/campaign.md）
import type { GameState, Move, PieceDef, RulesDef, Text, VariantDef } from '../engine/types';
import { estimateValue } from '../engine/engine';
import { PIECE_LIBRARY } from '../mix/build';
import { PRESETS } from '../variants/presets';

const L = (zh: string, en: string): Text => ({ zh, en });

export const MAX_W = 10;
export const MAX_DEPTH = 5;
export const STAGES = 9;

export type Difficulty = 'easy' | 'hard';
/** 領地上的一格：x 由左到右（0..MAX_W-1），r 從前線（0）往後 */
export type Cell = [number, number];

export interface ArmyPiece {
  type: string;
  x: number;
  r: number;
}

export interface RunState {
  seed: number;
  difficulty: Difficulty;
  start: string;
  stage: number;
  points: number;
  territory: Cell[];
  army: ArmyPiece[];
  /** 已購買、尚未擺上領地的棋子與方塊 */
  bench: string[];
  tiles: Cell[][];
  /** 這一關商店的商品（購買後移除） */
  offers: Offer[];
  lastResult?: 'win' | 'draw';
}

export type Offer =
  | { kind: 'piece'; type: string; cost: number }
  | { kind: 'tile'; cells: Cell[]; cost: number }
  | { kind: 'upgrade'; from: string; to: string; cost: number };

// ---------------- 棋子與旗幟 ----------------

export const FLAG: PieceDef = {
  id: 'flag', name: '旗幟', nameEn: 'Flag', labels: ['旗', '旗'], style: 'octagon', moves: [], royal: true, value: 0,
};

/** 可以招募或出現在敵軍中的棋子：不含王、只能在九宮內的棋子、升變後的棋子與緬甸兵 */
export const RECRUITABLE: PieceDef[] = Object.values(PIECE_LIBRARY).map(x => x.def).filter(d =>
  !d.royal && !d.demotesTo && !d.sittuyin && !d.moves.some(r => r.confine === 'palace' || r.when === 'palace'),
);
const recruitableFrom = (vid: string) => RECRUITABLE.filter(d => PIECE_LIBRARY[d.id].from.id === vid);

export const STARTS: { id: string; kit: string[] }[] = [
  { id: 'chess', kit: ['c.p', 'c.p', 'c.p', 'c.n', 'c.b'] },
  { id: 'xiangqi', kit: ['x.p', 'x.p', 'x.p', 'x.h', 'x.c'] },
  { id: 'shogi', kit: ['s.p', 's.p', 's.p', 's.s', 's.g'] },
  { id: 'janggi', kit: ['j.p', 'j.p', 'j.p', 'j.h', 'j.c'] },
  { id: 'makruk', kit: ['t.p', 't.p', 't.p', 't.n', 't.s'] },
];

/** 俄羅斯方塊（以 (x, r) 表示，r 往後） */
export const TETROMINOES: Cell[][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]], // I
  [[0, 0], [1, 0], [0, 1], [1, 1]], // O
  [[0, 0], [1, 0], [2, 0], [1, 1]], // T
  [[1, 0], [2, 0], [0, 1], [1, 1]], // S
  [[0, 0], [1, 0], [1, 1], [2, 1]], // Z
  [[0, 0], [0, 1], [0, 2], [1, 2]], // L
  [[1, 0], [1, 1], [1, 2], [0, 2]], // J
];

export function rotate(cells: Cell[]): Cell[] {
  const r = cells.map(([x, y]) => [-y, x] as Cell);
  const mx = Math.min(...r.map(c => c[0])), my = Math.min(...r.map(c => c[1]));
  return r.map(([x, y]) => [x - mx, y - my]);
}

// ---------------- 亂數 ----------------

export function rng(seed: number) {
  let s = seed | 0;
  return (n: number) => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

// ---------------- 新的一輪 ----------------

export function newRun(difficulty: Difficulty, start: string, seed = Date.now()): RunState {
  const kit = STARTS.find(s => s.id === start)!.kit;
  const territory: Cell[] = [];
  for (let r = 0; r < 2; r++) for (let x = 3; x <= 7; x++) territory.push([x, r]);
  const army: ArmyPiece[] = [
    { type: kit[0], x: 4, r: 0 }, { type: kit[1], x: 5, r: 0 }, { type: kit[2], x: 6, r: 0 },
    { type: kit[3], x: 3, r: 1 }, { type: 'flag', x: 5, r: 1 }, { type: kit[4], x: 7, r: 1 },
  ];
  const run: RunState = { seed, difficulty, start, stage: 0, points: 0, territory, army, bench: [], tiles: [], offers: [] };
  return run;
}

// ---------------- 關卡 ----------------

export interface Stage {
  index: number;
  act: 1 | 2 | 3;
  title: Text;
  goal: Text;
  theme: string;
  enemyWidth: number;
  enemyDepth: number;
  neutral: number;
  enemy: { type: string; x: number; e: number }[];
  rules: RulesDef;
  ruleCards: string[];
  ai: 'easy' | 'normal' | 'hard';
}

const ACT_THEMES = ['chess', 'xiangqi', 'shogi', 'janggi', 'makruk', 'shatranj', 'shatar', 'ouk', 'cotuong'];

export function stageInfo(run: RunState, index = run.stage): Stage {
  const rnd = rng(run.seed * 31 + index * 7919);
  const act: 1 | 2 | 3 = index < 4 ? 1 : index < 8 ? 2 : 3;
  const base: RulesDef = { win: 'captureRoyal', stalemate: 'loss', promotionZone: 0, repetition: 3, moveLimit: 100 };

  if (act === 3) {
    // 終幕：完整的西洋棋軍隊與國王，依西洋棋規則將死
    const chess = PRESETS.find(v => v.id === 'chess')!;
    const enemy = chess.setup.filter(p => p.side === 1).map(p => ({ type: p.type, x: p.x, e: p.type === 'c.p' ? 0 : 1 }));
    return {
      index, act, theme: 'chess', enemyWidth: 8, enemyDepth: 2, neutral: 2,
      title: L('終幕：王', 'Finale: the King'), goal: L('將死對方的國王', 'Checkmate the enemy king'),
      enemy,
      rules: { ...base, win: 'checkmate', stalemate: 'draw', castling: true },
      ruleCards: ['win.checkmate', 'special.castling'], ai: 'normal',
    };
  }

  const theme = ACT_THEMES[rnd(ACT_THEMES.length)];
  const pool = recruitableFrom(theme);
  const enemyWidth = act === 1 ? 4 + Math.min(index, 2) : 6 + Math.min(index - 4, 2);
  const enemyDepth = act === 1 ? (index < 2 ? 2 : 3) : 3;
  const neutral = act === 1 ? 1 + (index >= 2 ? 1 : 0) : 2;
  // 兵力預算隨關卡增加
  const budget = act === 1 ? 4 + index * 2.5 : 12 + (index - 4) * 4;
  const cells: [number, number][] = [];
  for (let e = 0; e < enemyDepth; e++) for (let x = 0; x < enemyWidth; x++) cells.push([x, e]);
  const flagCell: [number, number] = [Math.floor(enemyWidth / 2), enemyDepth - 1];
  const free = cells.filter(c => !(c[0] === flagCell[0] && c[1] === flagCell[1]));
  const sorted = [...pool].sort((a, b) => estimateValue(a) - estimateValue(b));
  const weak = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
  const enemy: Stage['enemy'] = [{ type: 'flag', x: flagCell[0], e: flagCell[1] }];
  let spent = 0;
  // 前排放弱棋子，其餘位置依預算放隨機棋子
  for (const [x, e] of free.filter(c => c[1] === 0)) {
    if (spent >= budget * 0.4) break;
    const d = weak[rnd(weak.length)];
    enemy.push({ type: d.id, x, e });
    spent += estimateValue(d);
  }
  const back = free.filter(c => c[1] > 0);
  while (spent < budget && back.length) {
    const [x, e] = back.splice(rnd(back.length), 1)[0];
    const d = pool[rnd(pool.length)];
    enemy.push({ type: d.id, x, e });
    spent += estimateValue(d);
  }
  const rules = { ...base };
  const ruleCards = ['win.capture-flag'];
  if (theme === 'shogi' && act === 2) { rules.drops = true; ruleCards.push('drop.basic'); }
  const themeVar = PRESETS.find(v => v.id === theme)!;
  return {
    index, act, theme, enemyWidth, enemyDepth, neutral, enemy, rules, ruleCards,
    ai: act === 1 && index < 2 ? 'easy' : 'normal',
    title: act === 1 ? L(`第一幕・奪旗 ${index + 1}/4`, `Act I · Capture the flag ${index + 1}/4`)
      : L(`第二幕・${themeVar.name}軍團 ${index - 3}/4`, `Act II · ${themeVar.nameEn} legion ${index - 3}/4`),
    goal: L('吃掉對方的旗幟；保護好自己的旗', 'Capture the enemy flag and protect your own'),
  };
}

// ---------------- 戰場 ----------------

export interface Arena {
  variant: VariantDef;
  /** 我方軍隊第幾枚棋子在棋盤上的哪一格 */
  armySquares: Map<number, number>;
}

export function buildArena(run: RunState, stage: Stage): Arena {
  const depth = Math.max(...run.territory.map(c => c[1])) + 1;
  const ex0 = Math.floor((MAX_W - stage.enemyWidth) / 2);
  const xs = [...run.territory.map(c => c[0]), ex0, ex0 + stage.enemyWidth - 1];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const W = maxX - minX + 1;
  const H = depth + stage.neutral + stage.enemyDepth;
  const yOfR = (r: number) => depth - 1 - r;
  const yOfE = (e: number) => depth + stage.neutral + e;
  const exists = new Set<string>();
  for (const [x, r] of run.territory) exists.add(`${x - minX},${yOfR(r)}`);
  for (let y = depth; y < depth + stage.neutral; y++) for (let x = 0; x < W; x++) exists.add(`${x},${y}`);
  for (let e = 0; e < stage.enemyDepth; e++) for (let x = 0; x < stage.enemyWidth; x++) exists.add(`${x + ex0 - minX},${yOfE(e)}`);
  const voids: [number, number][] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!exists.has(`${x},${y}`)) voids.push([x, y]);

  // 我方：王（終幕）或旗
  const kingType = finaleKing(run);
  const setup: VariantDef['setup'] = [];
  const armySquares = new Map<number, number>();
  run.army.forEach((p, i) => {
    const type = p.type === 'flag' && stage.act === 3 ? kingType : p.type;
    const x = p.x - minX, y = yOfR(p.r);
    setup.push({ type, side: 0, x, y });
    armySquares.set(i, y * W + x);
  });
  // 敵方 e = 0 是最靠近中立地帶的前排
  for (const p of stage.enemy) setup.push({ type: p.type, side: 1, x: p.x + ex0 - minX, y: yOfE(p.e) });

  const pieces: Record<string, PieceDef> = { flag: FLAG };
  const queue = setup.map(p => p.type);
  while (queue.length) {
    const id = queue.pop()!;
    if (pieces[id] || !PIECE_LIBRARY[id]) continue;
    const d = PIECE_LIBRARY[id].def;
    pieces[id] = d;
    queue.push(...(d.promotesTo ?? []));
    if (d.demotesTo) queue.push(d.demotesTo);
  }
  const theme = PRESETS.find(v => v.id === stage.theme)!;
  const startVar = PRESETS.find(v => v.id === run.start)!;
  const variant: VariantDef = {
    id: `campaign-${run.seed}-${stage.index}`,
    name: stage.title.zh, nameEn: stage.title.en,
    description: stage.goal.zh, descriptionEn: stage.goal.en,
    board: { width: W, height: H, cell: 'square', checkered: true, voids },
    pieces, setup, rules: stage.rules,
    sideNames: ['我方', '敵軍'], sideNamesEn: ['You', 'Enemy'],
    sideColors: [startVar.sideColors[0] === theme.sideColors[1] ? '#f4f1e8' : startVar.sideColors[0], theme.sideColors[1]],
  };
  return { variant, armySquares };
}

/** 終幕時我方的王：起始軍隊的王（若只能在九宮內走則改用西洋棋的王） */
export function finaleKing(run: RunState): string {
  const v = PRESETS.find(p => p.id === run.start)!;
  const king = Object.values(v.pieces).find(p => p.royal && !p.moves.some(r => r.confine === 'palace'));
  return king?.id ?? 'c.k';
}

/** 依對局過程，找出我方軍隊中被吃掉的棋子（回傳軍隊索引） */
export function lostPieces(arena: Arena, start: GameState, moves: Move[]): number[] {
  const at = new Map<number, number>(); // 格子 → 軍隊索引
  arena.armySquares.forEach((sq, i) => at.set(sq, i));
  const lost: number[] = [];
  let st = start;
  for (const m of moves) {
    if (!m.pass && m.from >= 0) {
      const capSq = m.ep ?? m.to;
      if (st.board[capSq]?.side === 0 && at.has(capSq)) { lost.push(at.get(capSq)!); at.delete(capSq); }
      const idx = at.get(m.from);
      if (idx !== undefined) { at.delete(m.from); at.set(m.to, idx); }
      if (m.castle) {
        const r = at.get(m.castle.from);
        if (r !== undefined) { at.delete(m.castle.from); at.set(m.castle.to, r); }
      }
    }
    st = { ...st, board: applyBoard(st.board, m) };
  }
  return lost;
}

function applyBoard(board: GameState['board'], m: Move): GameState['board'] {
  const b = board.slice();
  if (m.pass) return b;
  if (m.from < 0) { b[m.to] = { type: m.type, side: 0 }; return b; }
  const p = b[m.from];
  if (m.ep !== undefined) b[m.ep] = null;
  b[m.from] = null;
  b[m.to] = p ? { ...p, type: m.promo ?? p.type } : p;
  if (m.castle) { b[m.castle.to] = b[m.castle.from]; b[m.castle.from] = null; }
  return b;
}

// ---------------- 商店 ----------------

export const REWARD = (stage: number) => 4 + stage;

export function makeOffers(run: RunState): Offer[] {
  const rnd = rng(run.seed * 97 + run.stage * 131 + run.points);
  const offers: Offer[] = [];
  for (let i = 0; i < 3; i++) {
    const d = RECRUITABLE[rnd(RECRUITABLE.length)];
    offers.push({ kind: 'piece', type: d.id, cost: Math.max(1, Math.round(estimateValue(d))) });
  }
  for (let i = 0; i < 2; i++) offers.push({ kind: 'tile', cells: TETROMINOES[rnd(TETROMINOES.length)], cost: 3 });
  const mine = run.army.filter(p => p.type !== 'flag');
  if (mine.length) {
    const from = mine[rnd(mine.length)].type;
    const better = RECRUITABLE.filter(d => estimateValue(d) > estimateValue(PIECE_LIBRARY[from].def) + 0.5);
    if (better.length) {
      const to = better[rnd(better.length)];
      offers.push({ kind: 'upgrade', from, to: to.id, cost: Math.max(2, Math.round(estimateValue(to) - estimateValue(PIECE_LIBRARY[from].def))) });
    }
  }
  return offers;
}

/** 擴充方塊能不能放在這裡：不重疊、在範圍內、與領地相連 */
export function canPlaceTile(territory: Cell[], tile: Cell[], ax: number, ar: number): boolean {
  const own = new Set(territory.map(([x, r]) => `${x},${r}`));
  const cells = tile.map(([x, r]) => [x + ax, r + ar] as Cell);
  if (cells.some(([x, r]) => x < 0 || x >= MAX_W || r < 0 || r >= MAX_DEPTH || own.has(`${x},${r}`))) return false;
  return cells.some(([x, r]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dr]) => own.has(`${x + dx},${r + dr}`)));
}

// ---------------- 存檔 ----------------

const RUN_KEY = 'universal-chess.campaign.run';
const REC_KEY = 'universal-chess.campaign.records';

export interface Records {
  easy: { best: number; clears: number };
  hard: { best: number; clears: number };
}

export function loadRun(): RunState | null {
  try { return JSON.parse(localStorage.getItem(RUN_KEY) ?? 'null') as RunState | null; } catch { return null; }
}
export function saveRun(run: RunState | null) {
  try {
    if (run) localStorage.setItem(RUN_KEY, JSON.stringify(run));
    else localStorage.removeItem(RUN_KEY);
  } catch { /* 無法儲存時只在本次有效 */ }
}
export function loadRecords(): Records {
  try {
    return { easy: { best: 0, clears: 0 }, hard: { best: 0, clears: 0 }, ...JSON.parse(localStorage.getItem(REC_KEY) ?? '{}') } as Records;
  } catch {
    return { easy: { best: 0, clears: 0 }, hard: { best: 0, clears: 0 } };
  }
}
export function recordRun(difficulty: Difficulty, reached: number, cleared: boolean) {
  const r = loadRecords();
  r[difficulty].best = Math.max(r[difficulty].best, reached);
  if (cleared) r[difficulty].clears++;
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch { /* 忽略 */ }
}

