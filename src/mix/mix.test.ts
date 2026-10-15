import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/engine';
import { PRESETS } from '../variants/presets';
import { ARMY_SOURCES, BOARD_SOURCES, buildMix, checkMix } from './build';

describe('mix & match', () => {
  it('every playable combination starts a legal game', () => {
    let ok = 0, blocked = 0;
    for (const board of BOARD_SOURCES) for (const a0 of ARMY_SOURCES) for (const a1 of ARMY_SOURCES) {
      // 規則取自先手軍隊的棋種；佈陣軍隊需要打入
      const rules = { ...PRESETS.find(v => v.id === a0)!.rules };
      if (a0 === 'sittuyin' || a1 === 'sittuyin') Object.assign(rules, { drops: true, mustDrop: true, dropZone: 3 });
      const cfg = { board, armies: [a0, a1] as [string, string], rules };
      const { errors } = checkMix(cfg);
      const v = buildMix(cfg);
      if (errors.length || !v) { blocked++; continue; }
      const e = new Engine(v);
      const st = e.initialState();
      expect(e.result(st).kind, `${board} ${a0} ${a1}`).toBe('ongoing');
      expect(e.legalMoves(st).length, `${board} ${a0} ${a1}`).toBeGreaterThan(0);
      ok++;
    }
    expect(ok).toBeGreaterThan(200);
    expect(blocked).toBeGreaterThan(0);
  }, 120000);

  it('xiangqi army needs a palace and fits only 9-wide boards', () => {
    const rules = PRESETS.find(v => v.id === 'xiangqi')!.rules;
    expect(checkMix({ board: 'chess', armies: ['xiangqi', 'chess'], rules }).errors.length).toBeGreaterThan(0);
    expect(checkMix({ board: 'shogi', armies: ['xiangqi', 'chess'], rules }).errors.length).toBeGreaterThan(0); // 沒有九宮
    expect(checkMix({ board: 'xiangqi', armies: ['xiangqi', 'chess'], rules }).errors).toEqual([]);
  });

  it('mixed armies keep their own promotion zones', () => {
    const rules = { ...PRESETS.find(v => v.id === 'chess')!.rules, promotionZone: 1 };
    const v = buildMix({ board: 'shogi', armies: ['chess', 'shogi'], rules })!;
    expect(v.pieces['c.p'].promoZone).toBe(1);
    expect(v.pieces['s.p'].promoZone).toBe(3);
  });
});
