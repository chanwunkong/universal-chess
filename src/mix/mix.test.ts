import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/engine';
import type { RulesDef, Side } from '../engine/types';
import { PRESETS } from '../variants/presets';
import { ARMY_SOURCES, BOARD_SOURCES, armyFromBase, boardOf, buildMix, checkMix, type MixArmy, type MixConfig } from './build';

const rulesOf = (id: string): RulesDef => ({ ...PRESETS.find(v => v.id === id)!.rules });
const army = (base: string, side: Side, board: string) => armyFromBase(base, side, boardOf(board)) as MixArmy;

describe('mix & match', () => {
  it('every combination of base armies that fits starts a legal game', () => {
    let ok = 0, blocked = 0;
    for (const board of BOARD_SOURCES) for (const a0 of ARMY_SOURCES) for (const a1 of ARMY_SOURCES) {
      const x0 = armyFromBase(a0, 0, boardOf(board)), x1 = armyFromBase(a1, 1, boardOf(board));
      if ('problem' in x0 || 'problem' in x1) { blocked++; continue; }
      const rules = rulesOf(a0);
      if (a0 === 'sittuyin' || a1 === 'sittuyin') Object.assign(rules, { drops: true, mustDrop: true, dropZone: 3 });
      const cfg: MixConfig = { board, armies: [x0, x1], mirror: false, rules };
      const { errors } = checkMix(cfg);
      expect(errors, `${board} ${a0} ${a1}`).toEqual([]);
      const e = new Engine(buildMix(cfg)!);
      const st = e.initialState();
      expect(e.result(st).kind).toBe('ongoing');
      expect(e.legalMoves(st).length).toBeGreaterThan(0);
      ok++;
    }
    expect(ok).toBeGreaterThan(200);
    expect(blocked).toBeGreaterThan(0);
  }, 120000);

  it('mirroring reproduces the real setup of each base army', () => {
    for (const id of ['chess', 'shogi', 'makruk', 'xiangqi', 'janggi']) {
      const v = PRESETS.find(p => p.id === id)!;
      const built = buildMix({ board: id === 'cotuong' ? 'xiangqi' : id, armies: [army(id, 0, id), army(id, 1, id)], mirror: true, rules: v.rules })!;
      const key = (ps: { type: string; side: number; x: number; y: number }[]) => ps.map(p => `${p.type}${p.side}@${p.x},${p.y}`).sort().join(' ');
      expect(key(built.setup), id).toBe(key(v.setup));
    }
  });

  it('mixed armies: swap pieces and keep their own promotion zones', () => {
    const a = army('chess', 0, 'chess');
    // 把 b1 的騎士換成中國象棋的炮
    a.pieces = a.pieces.map(p => (p.x === 1 && p.rank === 0 ? { ...p, type: 'x.c' } : p));
    const cfg: MixConfig = { board: 'chess', armies: [a, a], mirror: true, rules: rulesOf('chess') };
    expect(checkMix(cfg).errors).toEqual([]);
    const v = buildMix(cfg)!;
    expect(v.nameEn).toBe('Custom armies');
    expect(v.setup.filter(p => p.type === 'x.c').length).toBe(2);
    const e = new Engine(v);
    // b1 的炮隔著自己 b2 的兵，可以吃掉 b7 的黑兵
    expect(e.legalMoves(e.initialState()).some(m => m.type === 'x.c' && e.sqName(m.from) === 'b1' && e.sqName(m.to) === 'b7' && m.capture)).toBe(true);
    const shogiMix = buildMix({ board: 'shogi', armies: [army('chess', 0, 'shogi'), army('shogi', 1, 'shogi')], mirror: false, rules: rulesOf('chess') })!;
    expect(shogiMix.pieces['c.p'].promoZone).toBe(1);
    expect(shogiMix.pieces['s.p'].promoZone).toBe(3);
  });

  it('flags missing kings and palace pieces outside the palace', () => {
    const a = army('chess', 0, 'xiangqi');
    const noKing = { ...a, pieces: a.pieces.filter(p => p.type !== 'c.k') };
    expect(checkMix({ board: 'xiangqi', armies: [noKing, noKing], mirror: true, rules: rulesOf('chess') }).errors.length).toBeGreaterThan(0);
    const adv = { ...a, pieces: [...a.pieces.filter(p => !(p.x === 0 && p.rank === 0)), { type: 'x.a', x: 0, rank: 0 }] };
    expect(checkMix({ board: 'xiangqi', armies: [adv, adv], mirror: true, rules: rulesOf('chess') }).warnings.length).toBeGreaterThan(0);
    expect(checkMix({ board: 'chess', armies: [adv, adv], mirror: true, rules: rulesOf('chess') }).errors.length).toBeGreaterThan(0);
  });
});
