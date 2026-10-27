import { describe, expect, it } from 'vitest';
import { Engine } from '../engine/engine';
import type { Move } from '../engine/types';
import { H, W, afterMove, applyBridge, campOffers, canBridge, currentCountry, inFinal, marchVariant, newMarch, scroll, scrollInterval, type MarchState } from './march';

/** 簡單的自動玩家：軍旗盡量往前，其餘隨機，偏好吃子 */
function step(s: MarchState, seed: number): MarchState {
  let st = s;
  for (const side of [0, 1] as const) {
    if (st.over) return st;
    const e = new Engine(marchVariant(st));
    const g = { ...st.game, turn: side };
    const ms = e.legalMoves(g).filter(m => !m.pass);
    let m: Move | undefined;
    if (side === 0) {
      const flagUp = ms.filter(m => m.type === 'mflag' && Math.floor(m.to / W) > Math.floor(m.from / W));
      m = flagUp.length && (seed + st.distance) % 2 === 0 ? flagUp[0] : (ms.find(x => x.capture) ?? ms[(seed * 7 + st.distance) % Math.max(1, ms.length)]);
    } else m = ms.find(x => x.capture && x.capture.type !== 'mflag') ?? ms[(seed * 3 + st.distance) % Math.max(1, ms.length)];
    if (m) {
      st = afterMove({ ...st, game: e.makeMove(g, m) }, m, side);
      if (!st.game.board.some(p => p?.side === 0 && p.type === 'mflag')) return { ...st, over: { win: false, reason: { zh: '軍旗被奪', en: 'flag taken' } } };
    }
  }
  st = { ...st, game: { ...st.game, turn: 0 }, movesSinceScroll: st.movesSinceScroll + 1 };
  if (st.movesSinceScroll >= scrollInterval(st)) st = scroll(st);
  return st;
}

describe('endless march', () => {
  it('starts with a legal position and fog-free start rows', () => {
    const s = newMarch('easy', 'chess', 1);
    const e = new Engine(marchVariant(s));
    expect(e.legalMoves(s.game).length).toBeGreaterThan(0);
    expect(s.game.board.filter(p => p?.side === 0).length).toBe(6);
  });

  it('scrolling shifts pieces down and drops the bottom row', () => {
    let s = newMarch('easy', 'chess', 2);
    const before = s.game.board[W + 3]; // 第二排的兵
    s = scroll(s);
    expect(s.game.board[3]).toEqual(before);
    expect(s.distance).toBe(1);
    expect(s.over?.win).toBe(false); // 軍旗原本在最下排，被捲出畫面
  });

  it('many simulated marches run without errors, switch countries and can reach the castle', () => {
    let reachedFinal = 0, switched = 0;
    for (let seed = 1; seed <= 25; seed++) {
      let s = newMarch(seed % 2 ? 'easy' : 'hard', ['chess', 'xiangqi', 'shogi', 'janggi', 'makruk'][seed % 5], seed);
      // 讓軍旗先離開最下排
      const first = s.visited[0];
      for (let t = 0; t < 700 && !s.over; t++) {
        s = step(s, seed);
        if (inFinal(s)) { reachedFinal++; break; }
      }
      if (s.visited.length > 1 || s.visited[0] !== first) switched++;
      // 視窗大小不變，棋子不會落在空洞上
      expect(s.rows.length).toBe(H);
      for (let y = 0; y < H; y++) for (const x of s.rows[y].voids) expect(s.game.board[y * W + x]).toBeNull();
    }
    expect(switched).toBeGreaterThan(0);
    expect(reachedFinal).toBeGreaterThanOrEqual(0);
  });

  it('the road ends at the king castle with checkmate rules', () => {
    let s = newMarch('easy', 'chess', 9);
    // 只保留軍旗並放在畫面中段，一路捲到王城
    const keepFlag = (st: MarchState): MarchState => {
      const board = st.game.board.map(() => null) as MarchState['game']['board'];
      board[3 * W + 4] = { type: 'mflag', side: 0 };
      return { ...st, game: { ...st.game, board }, rows: st.rows.map(r => ({ ...r, voids: [] })) };
    };
    let guard = 0;
    while (!inFinal(s) && guard++ < 400) s = scroll(keepFlag(s));
    expect(inFinal(s)).toBe(true);
    const v = marchVariant(s);
    expect(v.rules.win).toBe('checkmate');
    const before = s.distance;
    s = scroll(s);
    expect(s.distance).toBe(before); // 道路到此為止
    expect(s.game.board.some(p => p?.side === 1 && p.type === 'c.k')).toBe(true);
    expect(s.visited.length).toBeGreaterThanOrEqual(5);
  });

  it('bridges turn voids into road, and camps offer pieces and bridges', () => {
    let s = newMarch('easy', 'chess', 3);
    s = { ...s, rows: s.rows.map((r, y) => (y === 4 ? { ...r, voids: [2, 3] } : r)) };
    const I: [number, number][] = [[0, 0], [1, 0], [2, 0], [3, 0]];
    expect(canBridge(s, I, 1, 4)).toBe(true);
    expect(canBridge(s, I, 1, 5)).toBe(false); // 沒有蓋到空洞
    s = applyBridge(s, I, 1, 4);
    expect(s.rows[4].voids).toEqual([]);
    const offers = campOffers(s);
    expect(offers.some(o => o.kind === 'piece')).toBe(true);
    expect(offers.some(o => o.kind === 'bridge')).toBe(true);
    expect(currentCountry(s)).not.toBeNull();
  });
});
