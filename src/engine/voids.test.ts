import { describe, expect, it } from 'vitest';
import { Engine } from './engine';
import { PRESETS } from '../variants/presets';
import type { GameState, VariantDef } from './types';

const chess = PRESETS.find(v => v.id === 'chess')!;
const xiangqi = PRESETS.find(v => v.id === 'xiangqi')!;
const withVoids = (v: VariantDef, voids: [number, number][]): VariantDef => ({ ...v, board: { ...v.board, voids } });
const sq = (e: Engine, n: string) => (Number(n.slice(1)) - 1) * e.W + n.charCodeAt(0) - 97;
function place(e: Engine, pieces: [string, 0 | 1, string][]): GameState {
  const st = e.initialState();
  st.board.fill(null);
  for (const [t, s, n] of pieces) st.board[sq(e, n)] = { type: t, side: s };
  return st;
}
const targets = (e: Engine, st: GameState, from: string) =>
  e.legalMoves(st).filter(m => m.from === sq(e, from)).map(m => e.sqName(m.to)).sort();

describe('irregular boards (voids)', () => {
  it('slides stop at a void; nothing lands on a void', () => {
    const e = new Engine(withVoids(chess, [[3, 3]])); // d4 不存在
    const st = place(e, [['c.r', 0, 'd1'], ['c.k', 0, 'h1'], ['c.k', 1, 'h8']]);
    expect(targets(e, st, 'd1')).toEqual(['a1', 'b1', 'c1', 'd2', 'd3', 'e1', 'f1', 'g1']);
  });
  it('knights leap over voids but cannot land on them', () => {
    const e = new Engine(withVoids(chess, [[3, 1], [2, 2]])); // d2、c3 不存在
    const st = place(e, [['c.n', 0, 'b1'], ['c.k', 0, 'h1'], ['c.k', 1, 'h8']]);
    expect(targets(e, st, 'b1')).toEqual(['a3']); // c3 是空洞；d2 也是
  });
  it('a void blocks a xiangqi horse leg and stops a cannon line', () => {
    const e = new Engine(withVoids(xiangqi, [[1, 1], [1, 4]])); // b2、b5 不存在
    const st = place(e, [['x.h', 0, 'b1'], ['x.c', 0, 'b3'], ['x.k', 0, 'e1'], ['x.k', 1, 'd10']]);
    expect(targets(e, st, 'b1')).toEqual(['d2']); // 往前的馬腳 b2 是空洞
    expect(targets(e, st, 'b3').filter(t => t[0] === 'b')).toEqual(['b4']); // 炮往前走到 b4 就碰到空洞
  });
  it('no castling across a void, no drops onto voids', () => {
    const e = new Engine(withVoids(chess, [[5, 0]])); // f1 不存在
    const st = place(e, [['c.k', 0, 'e1'], ['c.r', 0, 'h1'], ['c.r', 0, 'a1'], ['c.k', 1, 'e8']]);
    const ms = e.legalMoves(st).map(m => e.sqName(m.from) + e.sqName(m.to));
    expect(ms).not.toContain('e1g1');
    expect(ms).toContain('e1c1');
    const shogi = PRESETS.find(v => v.id === 'shogi')!;
    const es = new Engine(withVoids(shogi, [[4, 4]]));
    const s2 = es.initialState();
    s2.hands[0] = { 's.g': 1 };
    expect(es.legalMoves(s2).some(m => m.from < 0 && m.to === 4 * 9 + 4)).toBe(false);
  });
});
