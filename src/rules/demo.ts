import { Engine } from '../engine/engine';
import type { GameState, Move, VariantDef } from '../engine/types';
import type { Demo } from './catalog';

/** 'a1'、'e10' → 格子索引 */
export function parseSq(e: Engine, name: string): number {
  const x = name.charCodeAt(0) - 97;
  const y = Number(name.slice(1)) - 1;
  return y * e.W + x;
}

/** 走法的文字代碼：一般走法 'b1d2'；打入 's.b@e5' */
export function moveKey(e: Engine, m: Move): string {
  return m.from < 0 ? `${m.type}@${e.sqName(m.to)}` : e.sqName(m.from) + e.sqName(m.to);
}

export function demoVariant(base: VariantDef, demo: Demo): VariantDef {
  return demo.rules ? { ...base, rules: { ...base.rules, ...demo.rules } } : base;
}

export function demoState(e: Engine, demo: Demo): GameState {
  const board: GameState['board'] = new Array(e.N).fill(null);
  for (const [type, side, sq] of demo.pieces) board[parseSq(e, sq)] = { type, side };
  return {
    board, turn: demo.turn ?? 0,
    hands: demo.hands ? [{ ...demo.hands[0] }, { ...demo.hands[1] }] : [{}, {}],
    ep: demo.ep ? parseSq(e, demo.ep) : -1, halfmoveClock: 0, passes: 0, ply: 0,
  };
}
