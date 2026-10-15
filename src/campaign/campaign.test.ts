import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/engine';
import { STARTS, STAGES, buildArena, canPlaceTile, lostPieces, makeOffers, newRun, rotate, stageInfo, TETROMINOES } from './campaign';

describe('campaign', () => {
  it('every stage of many runs builds a playable arena', () => {
    for (let seed = 1; seed <= 40; seed++) for (const s of STARTS) {
      const run = newRun('easy', s.id, seed);
      for (let i = 0; i < STAGES; i++) {
        const st = stageInfo(run, i);
        const { variant } = buildArena(run, st);
        const e = new Engine(variant);
        const g = e.initialState();
        const tag = `seed ${seed} start ${s.id} stage ${i} theme ${st.theme}`;
        expect(e.result(g).kind, tag).toBe('ongoing');
        expect(e.legalMoves(g).length, tag).toBeGreaterThan(0);
        // 雙方都要有旗或王
        for (const side of [0, 1] as const) expect(e.royals(g, side).length, tag).toBe(1);
        expect(variant.setup.length, tag).toBe(new Set(variant.setup.map(p => `${p.x},${p.y}`)).size);
        // 每一枚棋子都要落在存在的格子上
        const voids = new Set((variant.board.voids ?? []).map(([x, y]) => `${x},${y}`));
        for (const p of variant.setup) expect(voids.has(`${p.x},${p.y}`), `${tag}: ${p.type} on a void`).toBe(false);
        expect(g.board.filter(Boolean).length, tag).toBe(variant.setup.length);
        // 敵方的旗或王在敵方最後一排（棋盤最上方），我方的在我方陣地
        const enemyRoyal = g.board.findIndex(p => p?.side === 1 && variant.pieces[p.type]?.royal);
        expect(Math.floor(enemyRoyal / e.W), tag).toBe(e.H - 1);
      }
    }
  });

  it('capturing the flag wins', () => {
    const run = newRun('easy', 'chess', 7);
    const { variant } = buildArena(run, stageInfo(run, 0));
    const e = new Engine(variant);
    const g = e.initialState();
    const flag = g.board.findIndex(p => p?.side === 1 && p.type === 'flag');
    g.board[flag] = null;
    expect(e.result(g)).toMatchObject({ kind: 'win', winner: 0 });
  });

  it('tiles must touch the territory and stay in bounds', () => {
    const run = newRun('easy', 'chess', 1);
    const I = TETROMINOES[0];
    expect(canPlaceTile(run.territory, I, 3, 2)).toBe(true); // 領地正後方
    expect(canPlaceTile(run.territory, I, 3, 4)).toBe(false); // 沒有相連
    expect(canPlaceTile(run.territory, I, 3, 1)).toBe(false); // 重疊
    expect(canPlaceTile(run.territory, rotate(I), 2, 0)).toBe(true); // 直立貼在左側
    expect(canPlaceTile(run.territory, I, 8, 0)).toBe(false); // 超出寬度
  });

  it('shop offers exist and losses are tracked', () => {
    const run = newRun('hard', 'xiangqi', 3);
    expect(makeOffers(run).length).toBeGreaterThanOrEqual(5);
    const arena = buildArena(run, stageInfo(run, 0));
    const e = new Engine(arena.variant);
    let st = e.initialState();
    const start = st;
    // 讓敵方吃掉我方一枚棋子：直接找一步吃子
    const moves = [];
    for (let i = 0; i < 40; i++) {
      const ms = e.legalMoves(st);
      const cap = ms.find(m => m.capture && st.turn === 1);
      const m = cap ?? ms[i % ms.length];
      moves.push(m);
      st = e.makeMove(st, m);
      if (cap || e.result(st).kind !== 'ongoing') break;
    }
    const lost = lostPieces(arena, start, moves);
    const captured = moves.filter(m => m.capture && m.capture.side === 0).length;
    expect(lost.length).toBe(captured);
  });
});
