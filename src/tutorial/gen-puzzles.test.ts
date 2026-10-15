/// <reference types="node" />
// 產生「一步殺」謎題：GEN=1 npx vitest run src/tutorial/gen-puzzles.test.ts
// 由隨機對局中找出「輪走方恰好只有一步能將死對方」的局面；是否將死由引擎依各變體規則判定。
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { Engine } from '../engine/engine';
import { PRESETS } from '../variants/presets';
import type { GameState, Move } from '../engine/types';

const PER_VARIANT = 6;

it.skipIf(!process.env.GEN)('generate mate-in-one puzzles', () => {
  const out: Record<string, GameState[]> = {};
  for (const v of PRESETS) {
    const e = new Engine(v);
    let seed = 20261015;
    const rnd = (n: number) => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    };
    const mates = (st: GameState): Move[] => e.legalMoves(st).filter(m => {
      const next = e.makeMove(st, m);
      if (!e.inCheck(next, next.turn)) return false;
      const r = e.result(next, [st, next]);
      return r.kind === 'win' && r.winner === st.turn && r.reason.zh === '將死';
    });
    const found: GameState[] = [];
    for (let game = 0; game < 4000 && found.length < PER_VARIANT; game++) {
      const hist: GameState[] = [e.initialState(v.setupChoice ? [rnd(4), rnd(4)] : undefined)];
      for (let ply = 0; ply < 160; ply++) {
        const st = hist[hist.length - 1];
        if (e.result(st, hist).kind !== 'ongoing') break;
        const ms = e.legalMoves(st).filter(m => !m.pass);
        if (!ms.length) break;
        // 只取開局之後、輪走方未被將軍的局面
        // 雙方都還有至少 3 枚非王棋子，局面才像真實對局
        const army = (side: 0 | 1) => st.board.filter(p => p && p.side === side && !v.pieces[p.type]?.royal).length;
        if (ply >= 16 && army(0) >= 3 && army(1) >= 3 && !e.inCheck(st, st.turn) && !(v.rules.mustDrop && Object.values(st.hands[st.turn]).some(n => n > 0))) {
          const ok = mates(st);
          const uniq = new Set(ok.map(m => `${m.from}-${m.to}-${m.type}`));
          if (uniq.size === 1) {
            found.push({ ...st, boardCount: undefined, count: undefined });
            break;
          }
        }
        const caps = ms.filter(m => m.capture);
        const m = caps.length && rnd(5) === 0 ? caps[rnd(caps.length)] : ms[rnd(ms.length)];
        hist.push(e.makeMove(st, m));
      }
    }
    out[v.id] = found;
    console.log(v.id, found.length);
  }
  writeFileSync(new URL('./puzzles.json', import.meta.url), JSON.stringify(out));
}, 3_600_000);
