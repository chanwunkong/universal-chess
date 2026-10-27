// 無盡行軍：捲動的棋盤、國境規則、頭目與最終魔王「王」（設計見 design/endless-march-draft.md）
import type { GameState, Move, PieceDef, RulesDef, Side, Text, VariantDef } from '../engine/types';
import { estimateValue } from '../engine/engine';
import { PIECE_LIBRARY } from '../mix/build';
import { PRESETS } from '../variants/presets';
import { RECRUITABLE, STARTS, rng } from '../campaign/campaign';

const L = (zh: string, en: string): Text => ({ zh, en });

export const W = 8;
export const H = 9;
export const FOG = 2;
export const COUNTRY_LEN = 24;
export const COUNTRY_COUNT = 5;
export const CAMP_EVERY = 16;
const FINAL_START = COUNTRY_LEN * COUNTRY_COUNT;
/** 王城：前 3 排空地，接著兵一排、王與貴族一排 */
const CASTLE_PAWNS = FINAL_START + 3;
const CASTLE_BACK = FINAL_START + 4;

export type Difficulty = 'easy' | 'hard';
export type Item = 'supply' | 'recruit';

/** 行軍用的旗：可以往任何方向走一步、不能吃子；被吃掉或被捲出畫面就輸 */
export const MARCH_FLAG: PieceDef = {
  id: 'mflag', name: '軍旗', nameEn: 'Standard', labels: ['旗', '旗'], style: 'octagon', royal: true, value: 0,
  moves: [{ vectors: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]], range: 1, mode: 'move' }],
};
/** 頭目的軍旗：不會動，奪下即擊敗頭目 */
export const BANNER: PieceDef = {
  id: 'banner', name: '頭目軍旗', nameEn: 'Boss banner', labels: ['帥旗', '帥旗'], style: 'octagon', moves: [], value: 4,
};

/** 會經過的國家：棋種與在這個國家生效的規則 */
export const COUNTRIES: { id: string; rules: Partial<RulesDef>; ruleNote: Text }[] = [
  { id: 'chess', rules: {}, ruleNote: L('沒有特別的規則', 'No special rules') },
  { id: 'xiangqi', rules: {}, ruleNote: L('沒有特別的規則', 'No special rules') },
  { id: 'shogi', rules: { capturesToHand: true, dropZone: 0 }, ruleNote: L('打入：吃掉的棋子進入手中，可以打在任何空格', 'Drops: captured pieces join your hand and can be dropped anywhere') },
  { id: 'janggi', rules: { allowPass: true }, ruleNote: L('停著：可以選擇這一步不走', 'Passing: you may skip a move') },
  { id: 'makruk', rules: {}, ruleNote: L('沒有特別的規則', 'No special rules') },
  { id: 'shatranj', rules: {}, ruleNote: L('沒有特別的規則', 'No special rules') },
  { id: 'shatar', rules: {}, ruleNote: L('沒有特別的規則', 'No special rules') },
];

export interface RowInfo {
  g: number;
  voids: number[];
}

export interface MarchState {
  seed: number;
  difficulty: Difficulty;
  start: string;
  game: GameState;
  /** rows[y]：視窗中第 y 排（0 為最下方）對應的道路資訊 */
  rows: RowInfo[];
  /** 物品：格子索引 → 種類 */
  items: Record<number, Item>;
  /** 已經捲動的排數（前進距離） */
  distance: number;
  movesSinceScroll: number;
  points: number;
  lost: string[];
  captures: number;
  bosses: number;
  visited: string[];
  over?: { win: boolean; reason: Text };
}

const preset = (id: string) => PRESETS.find(v => v.id === id)!;

/** 國家的順序（每一輪隨機） */
export function countryOrder(seed: number): typeof COUNTRIES {
  const rnd = rng(seed * 13 + 5);
  const list = [...COUNTRIES];
  for (let i = list.length - 1; i > 0; i--) { const j = rnd(i + 1); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, COUNTRY_COUNT);
}

export const countryOfRow = (seed: number, g: number) => (g >= FINAL_START ? null : countryOrder(seed)[Math.floor(g / COUNTRY_LEN)]);

const poolOf = (vid: string) => RECRUITABLE.filter(d => PIECE_LIBRARY[d.id].from.id === vid);

/** 生成第 g 排道路：空洞、敵人、物品 */
export function genRow(seed: number, g: number, difficulty: Difficulty): { voids: number[]; enemies: [number, string][]; items: [number, Item][] } {
  const rnd = rng(seed * 7919 + g * 104729);
  const voids: number[] = [], enemies: [number, string][] = [], items: [number, Item][] = [];
  if (g < 5) return { voids, enemies, items }; // 開局的前幾排是安全的
  if (g >= FINAL_START) {
    // 王城：完整的西洋棋軍隊與國王
    const chess = preset('chess');
    if (g === CASTLE_PAWNS) for (let x = 0; x < W; x++) enemies.push([x, 'c.p']);
    if (g === CASTLE_BACK) chess.setup.filter(p => p.side === 1 && p.y === 7).forEach(p => enemies.push([p.x, p.type]));
    return { voids, enemies, items };
  }
  const c = Math.floor(g / COUNTRY_LEN), l = g % COUNTRY_LEN;
  const pool = poolOf(countryOrder(seed)[c].id);
  const strong = [...pool].sort((a, b) => estimateValue(b) - estimateValue(a));
  if (l === 0) return { voids, enemies, items }; // 國境線：空曠
  if (l === 20 || l === 21) {
    // 頭目：兩排密集的敵軍，後排中央有頭目軍旗
    const n = Math.min(W - 2, 3 + c + (difficulty === 'hard' ? 1 : 0));
    const cols = [...Array(W).keys()].sort(() => rnd(3) - 1).slice(0, n);
    for (const x of cols) {
      if (l === 21 && x === Math.floor(W / 2)) continue;
      const d = l === 20 ? pool[rnd(pool.length)] : strong[rnd(Math.min(3, strong.length))];
      enemies.push([x, d.id]);
    }
    if (l === 21) enemies.push([Math.floor(W / 2), 'banner']);
    return { voids, enemies, items };
  }
  const density = 0.22 + 0.06 * c + (difficulty === 'hard' ? 0.08 : 0);
  if (rnd(100) < density * 100) {
    const n = 1 + rnd(1 + Math.min(2, c));
    for (let i = 0; i < n; i++) {
      const x = rnd(W);
      if (!enemies.some(e => e[0] === x)) enemies.push([x, pool[rnd(pool.length)].id]);
    }
  }
  if (rnd(100) < 12) {
    const x = rnd(W);
    if (!enemies.some(e => e[0] === x)) items.push([x, rnd(3) === 0 ? 'recruit' : 'supply']);
  }
  if (rnd(100) < 25) {
    // 地形：一兩個空洞，但每排至少保留 5 格可以走
    const k = 1 + rnd(2);
    for (let i = 0; i < k; i++) {
      const x = rnd(W);
      if (!enemies.some(e => e[0] === x) && !items.some(it => it[0] === x) && !voids.includes(x) && W - voids.length > 5) voids.push(x);
    }
  }
  return { voids, enemies, items };
}

export function newMarch(difficulty: Difficulty, start: string, seed = Date.now()): MarchState {
  const kit = STARTS.find(s => s.id === start)!.kit;
  const board: GameState['board'] = new Array(W * H).fill(null);
  const rows: RowInfo[] = [];
  const items: Record<number, Item> = {};
  for (let y = 0; y < H; y++) {
    const row = genRow(seed, y, difficulty);
    rows.push({ g: y, voids: row.voids });
    for (const [x, t] of row.enemies) board[y * W + x] = { type: t, side: 1 };
    for (const [x, it] of row.items) items[y * W + x] = it;
  }
  const place = (x: number, y: number, type: string) => { board[y * W + x] = { type, side: 0 }; };
  place(3, 1, kit[0]); place(4, 1, kit[1]); place(5, 1, kit[2]);
  place(2, 0, kit[3]); place(4, 0, 'mflag'); place(6, 0, kit[4]);
  const game: GameState = { board, turn: 0, hands: [{}, {}], ep: -1, halfmoveClock: 0, passes: 0, ply: 0 };
  const s: MarchState = {
    seed, difficulty, start, game, rows, items, distance: 0, movesSinceScroll: 0,
    points: 0, lost: [], captures: 0, bosses: 0, visited: [],
  };
  s.visited = [currentCountry(s)?.id ?? 'king'];
  return s;
}

/** 我方軍旗所在的那一排決定目前的國家（越過國境線就切換） */
export function flagRow(s: MarchState): number {
  const i = s.game.board.findIndex(p => p?.side === 0 && p.type === 'mflag');
  return i < 0 ? 0 : Math.floor(i / W);
}
export const currentCountry = (s: MarchState) => countryOfRow(s.seed, s.rows[flagRow(s)].g);
export const inFinal = (s: MarchState) => s.rows[flagRow(s)].g >= FINAL_START || s.rows[H - 1].g >= CASTLE_BACK;

export function scrollInterval(s: MarchState): number {
  const base = s.difficulty === 'easy' ? 4 : 3;
  return Math.max(2, base - Math.floor(s.distance / 60));
}

export function marchVariant(s: MarchState): VariantDef {
  const country = currentCountry(s);
  const voids: [number, number][] = [];
  s.rows.forEach((r, y) => r.voids.forEach(x => voids.push([x, y])));
  const pieces: Record<string, PieceDef> = { mflag: MARCH_FLAG, banner: BANNER };
  for (const [k, v] of Object.entries(PIECE_LIBRARY)) pieces[k] = v.def;
  const base: RulesDef = {
    win: 'captureRoyal', royalSides: [0], stalemate: 'loss', promotionZone: 0, repetition: 0, moveLimit: 0,
    drops: true, capturesToHand: false, dropZone: 2, noPassDraw: true,
  };
  const rules: RulesDef = inFinal(s)
    ? { ...base, win: 'checkmate', royalSides: undefined, stalemate: 'draw', castling: true }
    : { ...base, ...(country?.rules ?? {}) };
  const startVar = preset(s.start);
  const enemyVar = preset(country?.id ?? 'chess');
  return {
    id: `march-${s.seed}`, name: '無盡行軍', nameEn: 'Endless March',
    board: { width: W, height: H, cell: 'square', checkered: true, voids },
    pieces, setup: [], rules,
    sideNames: ['我方', '敵軍'], sideNamesEn: ['You', 'Enemy'],
    sideColors: [startVar.sideColors[0] === enemyVar.sideColors[1] ? '#f4f1e8' : startVar.sideColors[0], enemyVar.sideColors[1]],
  };
}

/** 一步棋之後的收穫：吃子得分、拾取物品、擊敗頭目 */
export function afterMove(s: MarchState, m: Move, mover: Side): MarchState {
  const next = { ...s, items: { ...s.items } };
  if (mover === 0) {
    if (m.capture) {
      next.captures++;
      next.points += m.capture.type === 'banner' ? 10 : Math.max(1, Math.round(estimateValue(PIECE_LIBRARY[m.capture.type]?.def ?? BANNER)));
      if (m.capture.type === 'banner') next.bosses++;
    }
    const it = next.items[m.to];
    if (it && m.from >= 0) {
      delete next.items[m.to];
      if (it === 'supply') next.points += 3;
      else {
        const rnd = rng(s.seed + s.distance * 31 + m.to);
        const d = RECRUITABLE[rnd(RECRUITABLE.length)];
        next.game = { ...next.game, hands: [{ ...next.game.hands[0], [d.id]: (next.game.hands[0][d.id] ?? 0) + 1 }, next.game.hands[1]] };
      }
    }
  } else if (m.capture?.side === 0 && m.capture.type !== 'mflag') {
    next.lost = [...next.lost, m.capture.type];
  }
  return next;
}

/** 捲動一排：最下方一排移出畫面（我方棋子在那裡就失去），最上方生成新的一排 */
export function scroll(s: MarchState): MarchState {
  if (s.rows[H - 1].g >= CASTLE_BACK) return s; // 已經看得到王城，道路到此為止
  const board: GameState['board'] = new Array(W * H).fill(null);
  const lost = [...s.lost];
  let flagLost = false;
  for (let x = 0; x < W; x++) {
    const p = s.game.board[x];
    if (p?.side === 0) {
      if (p.type === 'mflag') flagLost = true;
      else lost.push(p.type);
    }
  }
  for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) board[(y - 1) * W + x] = s.game.board[y * W + x];
  const items: Record<number, Item> = {};
  for (const [k, v] of Object.entries(s.items)) { const sq = Number(k); if (sq >= W) items[sq - W] = v; }
  const g = s.rows[H - 1].g + 1;
  const row = genRow(s.seed, g, s.difficulty);
  for (const [x, t] of row.enemies) board[(H - 1) * W + x] = { type: t, side: 1 };
  for (const [x, it] of row.items) items[(H - 1) * W + x] = it;
  const rows = [...s.rows.slice(1), { g, voids: row.voids }];
  const next: MarchState = {
    ...s, rows, items, lost, distance: s.distance + 1, movesSinceScroll: 0,
    game: { ...s.game, board, ep: -1, last: undefined, passes: 0 },
  };
  const c = currentCountry(next)?.id ?? 'king';
  if (!next.visited.includes(c)) next.visited = [...next.visited, c];
  if (flagLost) next.over = { win: false, reason: L('軍旗被拋在後方', 'Your standard was left behind') };
  return next;
}

export const isCamp = (s: MarchState) => s.distance > 0 && s.distance % CAMP_EVERY === 0;

// ---------------- 紀錄 ----------------
const REC_KEY = 'universal-chess.march.records';
export interface MarchRecords { easy: { best: number; clears: number }; hard: { best: number; clears: number } }
export function loadMarchRecords(): MarchRecords {
  try {
    return { easy: { best: 0, clears: 0 }, hard: { best: 0, clears: 0 }, ...JSON.parse(localStorage.getItem(REC_KEY) ?? '{}') } as MarchRecords;
  } catch {
    return { easy: { best: 0, clears: 0 }, hard: { best: 0, clears: 0 } };
  }
}
export function recordMarch(d: Difficulty, distance: number, cleared: boolean) {
  const r = loadMarchRecords();
  r[d].best = Math.max(r[d].best, distance);
  if (cleared) r[d].clears++;
  try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch { /* 忽略 */ }
}

// ---------------- 營地商店：援軍與架橋方塊 ----------------

export type CampOffer = { kind: 'piece'; type: string; cost: number } | { kind: 'bridge'; cells: [number, number][]; cost: number };

export function campOffers(s: MarchState): CampOffer[] {
  const rnd = rng(s.seed * 389 + s.distance * 17);
  const offers: CampOffer[] = [];
  for (let i = 0; i < 4; i++) {
    const d = RECRUITABLE[rnd(RECRUITABLE.length)];
    offers.push({ kind: 'piece', type: d.id, cost: Math.max(1, Math.round(estimateValue(d))) });
  }
  for (let i = 0; i < 2; i++) offers.push({ kind: 'bridge', cells: TETROMINO_CELLS[rnd(TETROMINO_CELLS.length)], cost: 2 });
  return offers;
}

const TETROMINO_CELLS: [number, number][][] = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[1, 0], [1, 1], [1, 2], [0, 2]],
];

/** 架橋：方塊（以畫面座標 x, y；y 往上）蓋到的空洞變成可以走的路；至少要蓋到一個空洞，且不能超出畫面 */
export function bridgeCells(cells: [number, number][], ax: number, ay: number): [number, number][] {
  return cells.map(([x, r]) => [x + ax, ay - r]);
}
export function canBridge(s: MarchState, cells: [number, number][], ax: number, ay: number): boolean {
  const placed = bridgeCells(cells, ax, ay);
  if (placed.some(([x, y]) => x < 0 || x >= W || y < 0 || y >= H)) return false;
  return placed.some(([x, y]) => s.rows[y].voids.includes(x));
}
export function applyBridge(s: MarchState, cells: [number, number][], ax: number, ay: number): MarchState {
  const placed = bridgeCells(cells, ax, ay);
  const rows = s.rows.map((r, y) => ({ ...r, voids: r.voids.filter(x => !placed.some(([px, py]) => px === x && py === y)) }));
  return { ...s, rows };
}
