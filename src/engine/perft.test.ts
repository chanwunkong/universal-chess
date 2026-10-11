import { describe, expect, it } from 'vitest';
import { Engine } from './engine';
import { PRESETS } from '../variants/presets';
import type { GameState } from './types';

function perft(e: Engine, st: GameState, d: number): number {
  const ms = e.legalMoves(st);
  if (d === 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(e, e.makeMove(st, m), d - 1);
  return n;
}
const get = (id: string) => new Engine(PRESETS.find(v => v.id === id)!);

describe('perft', () => {
  it('chess', () => {
    const e = get('chess');
    expect([1, 2, 3].map(d => perft(e, e.initialState(), d))).toEqual([20, 400, 8902]);
  });
  it('xiangqi', () => {
    const e = get('xiangqi');
    expect([1, 2, 3].map(d => perft(e, e.initialState(), d))).toEqual([44, 1920, 79666]);
  });
  it('shogi', () => {
    const e = get('shogi');
    expect([1, 2, 3].map(d => perft(e, e.initialState(), d))).toEqual([30, 900, 25470]);
  });
  it('janggi / shatar generate moves', () => {
    for (const id of ['janggi', 'shatar', 'cotuong']) {
      const e = get(id);
      expect(perft(e, e.initialState(), 2)).toBeGreaterThan(100);
    }
  });
});

describe('special rules', () => {
  it('chess en passant + castling (kiwipete perft 1-2)', () => {
    const e = get('chess');
    // Kiwipete: r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R';
    const st = e.initialState();
    st.board.fill(null);
    const map: Record<string, string> = { k: 'c.k', q: 'c.q', r: 'c.r', b: 'c.b', n: 'c.n', p: 'c.p' };
    fen.split('/').forEach((row, i) => {
      let x = 0; const y = 7 - i;
      for (const ch of row) {
        if (/\d/.test(ch)) { x += +ch; continue; }
        const side = ch === ch.toUpperCase() ? 0 : 1;
        const t = map[ch.toLowerCase()];
        const moved = t === 'c.p' ? (side === 0 ? y !== 1 : y !== 6) : false;
        st.board[y * 8 + x] = { type: t, side, moved };
        x++;
      }
    });
    expect(perft(e, st, 1)).toBe(48);
    expect(perft(e, st, 2)).toBe(2039);
  });
});

import { AI } from './ai';
describe('ai', () => {
  it('finds mate in one and plays legal moves in every preset', () => {
    const e = get('chess');
    const st = e.initialState();
    // 學者將死前一步：白后 h5、主教 c4，黑方走了 Nc6 Nf6
    const play = (u: string) => {
      const ms = e.legalMoves(st);
      const m = ms.find(m => e.sqName(m.from) + e.sqName(m.to) === u)!;
      Object.assign(st, e.makeMove(st, m));
    };
    ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6'].forEach(play);
    const m = new AI(e).choose(st, 2000, 3)!;
    expect(e.sqName(m.from) + e.sqName(m.to)).toBe('h5f7');
    for (const v of PRESETS) {
      const en = new Engine(v);
      const s0 = en.initialState();
      const mv = new AI(en).choose(s0, 300, 2)!;
      expect(en.legalMoves(s0)).toContainEqual(mv);
    }
  });
});

describe('southeast asia / persia', () => {
  it('makruk perft matches Fairy-Stockfish', () => {
    const e = get('makruk');
    expect([1, 2, 3].map(d => perft(e, e.initialState(), d))).toEqual([23, 529, 12012]);
  });
  it('ouk: king knight-leap and neang double step only on first move', () => {
    const e = get('ouk');
    const st = e.initialState();
    const names = (s: typeof st) => e.legalMoves(s).map(m => e.sqName(m.from) + e.sqName(m.to));
    const play = (s: typeof st, u: string) => e.makeMove(s, e.legalMoves(s).find(m => e.sqName(m.from) + e.sqName(m.to) === u)!);
    expect(names(st)).toEqual(expect.arrayContaining(['d1b2', 'd1f2'])); // 王走馬步
    const s2 = play(play(st, 'e3e4'), 'a6a5');
    expect(names(s2)).toContain('e1e3'); // Neang 直跳兩格
    const s3 = play(play(s2, 'e1d2'), 'a5a4');
    expect(names(s3)).not.toContain('d2d4'); // 已經動過就不能再跳
  });
  it('shatranj bare king loses', () => {
    const e = get('shatranj');
    const st = e.initialState();
    st.board.fill(null);
    st.board[4] = { type: 'p.k', side: 0 };
    st.board[0] = { type: 'p.r', side: 0 };
    st.board[60] = { type: 'p.k', side: 1 };
    expect(e.result(st)).toMatchObject({ kind: 'win', winner: 0, reason: '光王' });
  });
});

describe('sourced rules', () => {
  const at = (e: Engine, s: string) => (s.charCodeAt(1) - 49) * e.W + s.charCodeAt(0) - 97;
  const empty = (e: Engine) => { const st = e.initialState(); st.board.fill(null); return st; };
  const play = (e: Engine, s: GameState, u: string) => {
    const m = e.legalMoves(s).find(m => e.sqName(m.from) + e.sqName(m.to) === u);
    if (!m) throw new Error('illegal ' + u);
    return e.makeMove(s, m);
  };

  it('ouk: enemy rook on king line removes the leap forever', () => {
    const e = get('ouk');
    let st = e.initialState();
    st.board[at(e, 'a6')] = null; st.board[at(e, 'a3')] = null; st.board[at(e, 'a1')] = null;
    st = play(e, st, 'b3b4');
    st = play(e, st, 'a8a1'); // 黑車走到白王所在的第一排
    st = play(e, st, 'b4b5');
    st = play(e, st, 'a1a7'); // 車離開
    const names = e.legalMoves(st).map(m => e.sqName(m.from) + e.sqName(m.to));
    expect(names).not.toContain('d1b2');
    expect(names).not.toContain('d1f2');
  });

  it('shatranj: bare king may bare back for a draw', () => {
    const e = get('shatranj');
    const st = empty(e);
    st.board[at(e, 'e1')] = { type: 'p.k', side: 0 };
    st.board[at(e, 'e8')] = { type: 'p.k', side: 1 };
    st.board[at(e, 'd7')] = { type: 'p.r', side: 0 };
    st.turn = 1;
    expect(e.result(st).kind).toBe('ongoing'); // 黑方光王，但輪黑走、白只剩兩子
    const after = play(e, st, 'e8d7');
    expect(e.result(after)).toMatchObject({ kind: 'draw' });
    const st2 = { ...st, board: st.board.slice() };
    st2.board[at(e, 'a1')] = { type: 'p.r', side: 0 };
    expect(e.result(st2)).toMatchObject({ kind: 'win', winner: 0 }); // 白有三子：直接判負
  });

  it('makruk: pieces honour counting with one rook draws after limit', () => {
    const e = get('makruk');
    let st = empty(e);
    st.board[at(e, 'a1')] = { type: 't.k', side: 0, moved: true };
    st.board[at(e, 'h8')] = { type: 't.k', side: 1, moved: true };
    st.board[at(e, 'b2')] = { type: 't.r', side: 0, moved: true };
    st.board[at(e, 'g7')] = { type: 't.n', side: 1, moved: true };
    st = play(e, st, 'b2b7');
    st = play(e, st, 'g7e6');
    st = play(e, st, 'b7b6');
    st = play(e, st, 'e6d4');
    st = play(e, st, 'b6b4'); // 白車攻擊 d4 馬
    st = play(e, st, 'd4f3');
    st = play(e, st, 'b4b3');
    st = play(e, st, 'f3e5');
    st = play(e, st, 'b3b5');
    st = play(e, st, 'e5f7');
    st = play(e, st, 'b5f5');
    st = play(e, st, 'f7h6');
    st = play(e, st, 'f5h5'); // 白車吃馬前一步
    st = play(e, st, 'h8g7');
    st = play(e, st, 'h5h6'); // 吃掉黑方最後一子 → 棋子數開始
    const cs = e.countStatus(st)!;
    expect(cs.kind).toBe('pieces');
    expect(cs.limit).toBe(32); // 一車：16 回合
    expect(cs.ply).toBe(6); // 盤上 3 子 → 從 3+1 起數
    // 王車來回走到上限
    let k = 0;
    const kingMoves = ['g7g8', 'g8g7'];
    const rookMoves = ['h6h5', 'h5h6'];
    while (e.result(st).kind === 'ongoing' && k < 60) {
      st = play(e, st, st.turn === 1 ? kingMoves[(k >> 1) % 2] : rookMoves[(k >> 1) % 2]);
      k++;
    }
    expect(e.result(st)).toMatchObject({ kind: 'draw' });
  });

  it('makruk: board honour — counting side mating is a draw', () => {
    const e = get('makruk');
    let st = empty(e);
    // 白方（數步方）有兩車，黑方王在角落：白車將死黑王
    st.board[at(e, 'a1')] = { type: 't.k', side: 0, moved: true };
    st.board[at(e, 'b7')] = { type: 't.r', side: 0, moved: true };
    st.board[at(e, 'c1')] = { type: 't.r', side: 0, moved: true };
    st.board[at(e, 'h8')] = { type: 't.k', side: 1, moved: true };
    st.board[at(e, 'f6')] = { type: 't.s', side: 1, moved: true };
    expect(e.canDeclareCount(st, 0)).toBe(true);
    st = e.declareCount(st, 0);
    st = play(e, st, 'c1c8');
    expect(e.result(st)).toMatchObject({ kind: 'draw' });
  });

  it('chess repetition respects castling rights', () => {
    const e = get('chess');
    let st = e.initialState();
    const h0 = e.hash(st);
    for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) st = play(e, st, u);
    expect(e.hash(st)).toBe(h0); // 馬出去再回來：同一局面
    for (const u of ['e2e4', 'e7e5', 'e1e2', 'e8e7', 'e2e1', 'e7e8']) st = play(e, st, u);
    const h1 = e.hash(st);
    for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) st = play(e, st, u);
    expect(e.hash(st)).toBe(h1);
    const fresh = play(e, play(e, e.initialState(), 'e2e4'), 'e7e5');
    expect(e.hash(fresh)).not.toBe(h1); // 王動過後失去入堡權：局面不同
  });
});
