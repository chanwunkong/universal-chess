import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/engine';
import { PRESETS } from '../variants/presets';
import { RULES } from './catalog';
import { demoState, demoVariant, moveKey } from './demo';

describe('rule encyclopedia', () => {
  it('ids are unique and games exist', () => {
    expect(new Set(RULES.map(r => r.id)).size).toBe(RULES.length);
    for (const r of RULES) for (const g of r.games ?? []) expect(PRESETS.some(v => v.id === g), `${r.id}: ${g}`).toBe(true);
    for (const r of RULES) expect(r.sources.length, r.id).toBeGreaterThan(0);
  });
  for (const r of RULES.filter(r => r.demo)) {
    it(`demo ${r.id}`, () => {
      const d = r.demo!;
      const v = demoVariant(PRESETS.find(x => x.id === d.base)!, d);
      const e = new Engine(v);
      const st = demoState(e, d);
      expect(e.result(st).kind, 'demo position must be ongoing').toBe('ongoing');
      const keys = new Set(e.legalMoves(st).map(m => moveKey(e, m)));
      for (const a of d.accept ?? []) expect(keys.has(a), `${r.id}: ${a} should be legal`).toBe(true);
      for (const a of d.illegal ?? []) expect(keys.has(a), `${r.id}: ${a} should be illegal`).toBe(false);
    });
  }
});
