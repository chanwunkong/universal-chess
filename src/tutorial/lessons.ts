// 教學關卡：由變體資料自動產生（棋子走法），謎題由產生器預先算好（puzzles.json）。
import { Engine, estimateValue } from '../engine/engine';
import type { GameState, Move, VariantDef } from '../engine/types';
import puzzleData from './puzzles.json';

export interface PieceLesson {
  kind: 'piece';
  id: string;
  piece: string;
  start: number;
  stars: number[];
  /** 固定不動的己方棋子（炮架、蹩腳示範） */
  blockers: number[];
  blockerType: string;
  /** 收集全部星星的最少步數 */
  optimal: number;
}

export interface PuzzleLesson {
  kind: 'puzzle';
  id: string;
  state: GameState;
}

export type Lesson = PieceLesson | PuzzleLesson;

/** 關卡局面：一枚要練習的棋子，加上不會動的己方擋子 */
export function soloState(e: Engine, type: string, sq: number, moved = false, blockers: number[] = [], blockerType = ''): GameState {
  const board: GameState['board'] = new Array(e.N).fill(null);
  for (const b of blockers) board[b] = { type: blockerType, side: 0, moved: true };
  board[sq] = { type, side: 0, moved };
  return { board, turn: 0, hands: [{}, {}], ep: -1, halfmoveClock: 0, passes: 0, ply: 0 };
}

/** 練習棋子可走的（不升變、不吃子）走法 */
export function soloMoves(e: Engine, st: GameState, sq: number): Move[] {
  return e.legalMoves(st).filter(m => m.from === sq && !m.promo && !m.capture && !m.pass);
}

function seeded(seed: number) {
  return (n: number) => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h;
}

/** 收集所有星星的最少步數（狀態：位置、是否動過、已收集的星星） */
function optimalSteps(e: Engine, l: Omit<PieceLesson, 'optimal' | 'kind' | 'id'>): number {
  const full = (1 << l.stars.length) - 1;
  const k = (sq: number, moved: boolean, mask: number) => `${sq}|${+moved}|${mask}`;
  let frontier: [number, boolean, number][] = [[l.start, false, 0]];
  const seen = new Set([k(l.start, false, 0)]);
  for (let d = 1; d < 64 && frontier.length; d++) {
    const next: [number, boolean, number][] = [];
    for (const [sq, moved, mask] of frontier) {
      for (const m of soloMoves(e, soloState(e, l.piece, sq, moved, l.blockers, l.blockerType), sq)) {
        const i = l.stars.indexOf(m.to);
        const nm = i >= 0 ? mask | (1 << i) : mask;
        if (nm === full) return d;
        const key = k(m.to, true, nm);
        if (!seen.has(key)) { seen.add(key); next.push([m.to, true, nm]); }
      }
    }
    frontier = next;
  }
  return Infinity;
}

/** 選一種擋子：不是練習中的棋子、不是王、沒有跳子走法（避免影響包的規則） */
function pickBlocker(v: VariantDef, type: string): string {
  // 用價值最低的棋子（通常是兵卒）當擋子，避免出現士、象在不該出現的位置
  const ok = Object.values(v.pieces).filter(p => p.id !== type && !p.royal && !p.demotesTo && !p.moves.some(r => r.hop));
  ok.sort((a, b) => estimateValue(a) - estimateValue(b));
  return ok[0]?.id ?? type;
}

export function pieceLessons(v: VariantDef): PieceLesson[] {
  const e = new Engine(v);
  const order = [...new Set([...v.setup.filter(p => p.side === 0).map(p => p.type), ...Object.keys(v.initialHands ?? {}), ...Object.keys(v.pieces)])];
  const lessons: PieceLesson[] = [];
  for (const type of order) {
    const def = v.pieces[type];
    if (!def) continue;
    const rnd = seeded(hashStr(v.id + type));
    const blockerType = pickBlocker(v, type);
    const hops = def.moves.some(r => r.hop);
    const lame = def.moves.some(r => r.lame);

    // 起點：開局時的位置；沒有的話選可走步數最多、最靠中央的格子
    const placed = v.setup.find(p => p.side === 0 && p.type === type);
    let start = placed ? placed.y * e.W + placed.x : -1;
    if (start < 0) {
      let best = -1;
      for (let sq = 0; sq < e.N; sq++) {
        const n = soloMoves(e, soloState(e, type, sq), sq).length;
        const cx = Math.abs((sq % e.W) - (e.W - 1) / 2) + Math.abs(Math.floor(sq / e.W) - (e.H - 1) / 2);
        const score = n * 100 - cx;
        if (n > 0 && score > best) { best = score; start = sq; }
      }
      if (start < 0 && hops) start = Math.floor(e.H / 2) * e.W + Math.floor(e.W / 2);
    }
    if (start < 0) continue;

    // 擋子：跳子棋子需要炮架；會被擋住的棋子示範一次蹩腳
    const blockers: number[] = [];
    const sx = start % e.W, sy = Math.floor(start / e.W);
    if (hops) {
      const lineSqs: number[] = [];
      for (let x = 0; x < e.W; x++) if (x !== sx && Math.abs(x - sx) <= 3) lineSqs.push(sy * e.W + x);
      for (let y = 0; y < e.H; y++) if (y !== sy && Math.abs(y - sy) <= 3) lineSqs.push(y * e.W + sx);
      // 多試幾組，選一組讓棋子至少有 3 種走法的炮架擺法
      for (let attempt = 0; attempt < 40; attempt++) {
        const trial: number[] = [];
        while (trial.length < Math.min(3, lineSqs.length)) {
          const q = lineSqs[rnd(lineSqs.length)];
          if (!trial.includes(q)) trial.push(q);
        }
        if (soloMoves(e, soloState(e, type, start, false, trial, blockerType), start).length >= 3) {
          blockers.push(...trial);
          break;
        }
      }
    } else if (lame) {
      for (const r of def.moves) if (r.lame) for (const [vx, vy] of r.vectors) {
        if (blockers.length) break;
        const n = Math.max(Math.abs(vx), Math.abs(vy));
        if (n < 2) continue;
        // 第一個途經格（與引擎的蹩腳判定相同：先沿長軸直走一步）
        const ax = Math.abs(vx), ay = Math.abs(vy);
        const bx = sx + (ax === ay ? Math.sign(vx) : ax > ay ? Math.sign(vx) : 0);
        const by = sy + (ax === ay ? Math.sign(vy) : ay > ax ? Math.sign(vy) : 0);
        const b = by * e.W + bx;
        // 只有在棋子仍然有路可走時才放（不能把它完全擋死）
        if (bx >= 0 && by >= 0 && bx < e.W && by < e.H && soloMoves(e, soloState(e, type, start, false, [b], blockerType), start).length >= 2)
          blockers.push(b);
      }
    }

    // 沿著實際走得到的路線放星星，保證每關都能完成
    const stars: number[] = [];
    let cur = start, moved = false;
    for (let step = 1; step <= 12 && stars.length < 3; step++) {
      const ms = soloMoves(e, soloState(e, type, cur, moved, blockers, blockerType), cur);
      if (!ms.length) break;
      cur = ms[rnd(ms.length)].to;
      moved = true;
      if (step % 2 === 0 && cur !== start && !stars.includes(cur) && !blockers.includes(cur)) stars.push(cur);
    }
    if (!stars.length && cur !== start) stars.push(cur);
    if (!stars.length) continue;
    const base = { piece: type, start, stars, blockers, blockerType };
    const optimal = optimalSteps(e, base);
    if (!Number.isFinite(optimal)) continue;
    lessons.push({ kind: 'piece', id: `${v.id}:piece:${type}`, ...base, optimal });
  }
  return lessons;
}

export function puzzleLessons(v: VariantDef): PuzzleLesson[] {
  const list = (puzzleData as unknown as Record<string, GameState[]>)[v.id] ?? [];
  return list.map((state, i) => ({ kind: 'puzzle', id: `${v.id}:puzzle:${i}`, state }));
}

// ---------- 進度（存在本機） ----------
const KEY = 'universal-chess.progress';

export function loadProgress(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

export function saveStars(id: string, stars: number) {
  const p = loadProgress();
  if ((p[id] ?? 0) >= stars) return;
  p[id] = stars;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 無法儲存時只在本次有效 */ }
}
