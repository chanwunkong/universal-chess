import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/engine';
import { PRESETS } from '../variants/presets';
import { pieceLessons, puzzleLessons } from './lessons';

describe('tutorial', () => {
  for (const v of PRESETS) {
    it(`${v.id}: every piece has a solvable lesson, every puzzle has exactly one mate`, () => {
      const lessons = pieceLessons(v);
      // 每種棋子都要有走法關卡
      expect(lessons.map(l => l.piece).sort()).toEqual(Object.keys(v.pieces).sort());
      for (const l of lessons) {
        expect(l.stars.length).toBeGreaterThan(0);
        expect(Number.isFinite(l.optimal)).toBe(true);
      }
      const e = new Engine(v);
      const puzzles = puzzleLessons(v);
      expect(puzzles.length).toBeGreaterThanOrEqual(5);
      for (const p of puzzles) {
        const mates = e.legalMoves(p.state).filter(m => {
          const next = e.makeMove(p.state, m);
          const r = e.result(next, [p.state, next]);
          return r.kind === 'win' && r.winner === p.state.turn && r.reason.zh === '將死';
        });
        expect(new Set(mates.map(m => `${m.from}-${m.to}-${m.type}`)).size).toBe(1);
      }
    }, 60000);
  }
});
