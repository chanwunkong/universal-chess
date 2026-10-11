import { Engine } from './engine';
import type { GameState, Move, Side } from './types';

class Timeout extends Error {}

/** 通用 AI：迭代加深 negamax + alpha-beta + 吃子靜態搜尋，評估以子力為主 */
export class AI {
  private e: Engine;
  private deadline = 0;
  private nodes = 0;
  private center: Float32Array;

  constructor(e: Engine) {
    this.e = e;
    this.center = new Float32Array(e.N);
    const cx = (e.W - 1) / 2, cy = (e.H - 1) / 2;
    for (let i = 0; i < e.N; i++) {
      const d = Math.abs((i % e.W) - cx) / e.W + Math.abs(Math.floor(i / e.W) - cy) / e.H;
      this.center[i] = 0.1 * (1 - d);
    }
  }

  private val(type: string): number {
    const def = this.e.def(type);
    if (def?.royal) return this.e.v.rules.win === 'checkmate' ? 0 : 200;
    return this.e.values[type] ?? 1;
  }

  evaluate(st: GameState): number {
    let s = 0;
    for (let i = 0; i < this.e.N; i++) {
      const p = st.board[i];
      if (!p) continue;
      const v = this.val(p.type) + this.center[i] * (this.e.def(p.type)?.royal ? -1 : 1);
      s += p.side === st.turn ? v : -v;
    }
    for (const side of [0, 1] as Side[])
      for (const t in st.hands[side]) {
        const v = this.val(t) * 1.1 * st.hands[side][t];
        s += side === st.turn ? v : -v;
      }
    return s;
  }

  private order(ms: Move[]): Move[] {
    const score = (m: Move) => (m.capture ? 10 * this.val(m.capture.type) - this.val(m.type) : 0) + (m.promo ? 5 : 0);
    return ms.map(m => [score(m), m] as const).sort((a, b) => b[0] - a[0]).map(x => x[1]);
  }

  private terminal(st: GameState, ply: number): number | null {
    const r = this.e.result(st);
    if (r.kind === 'ongoing') return null;
    if (r.kind === 'draw') return 0;
    return r.winner === st.turn ? 1000 - ply : -1000 + ply;
  }

  private quiesce(st: GameState, alpha: number, beta: number, depth: number): number {
    if (++this.nodes % 256 === 0 && Date.now() > this.deadline) throw new Timeout();
    const stand = this.evaluate(st);
    if (stand >= beta || depth <= 0) return stand;
    if (stand > alpha) alpha = stand;
    const caps = this.order(this.e.legalMoves(st).filter(m => m.capture));
    for (const m of caps) {
      const sc = -this.quiesce(this.e.makeMove(st, m), -beta, -alpha, depth - 1);
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  private search(st: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    if (++this.nodes % 256 === 0 && Date.now() > this.deadline) throw new Timeout();
    const t = this.terminal(st, ply);
    if (t !== null) return t;
    if (depth <= 0) return this.quiesce(st, alpha, beta, 4);
    let best = -Infinity;
    for (const m of this.order(this.e.legalMoves(st))) {
      const sc = -this.search(this.e.makeMove(st, m), depth - 1, -beta, -alpha, ply + 1);
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** 在時間限制內選出最佳走法；randomness 讓簡單難度會犯錯 */
  choose(st: GameState, timeMs: number, maxDepth: number, randomness = 0): Move | null {
    const moves = this.order(this.e.legalMoves(st));
    if (!moves.length) return null;
    this.deadline = Date.now() + timeMs;
    let bestMove = moves[0];
    let ranked: { m: Move; s: number }[] = [];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        const scores: { m: Move; s: number }[] = [];
        let alpha = -Infinity;
        for (const m of moves) {
          const s = -this.search(this.e.makeMove(st, m), d - 1, -Infinity, randomness > 0 ? Infinity : -alpha + 0.001, 1);
          scores.push({ m, s });
          if (s > alpha) alpha = s;
        }
        scores.sort((a, b) => b.s - a.s);
        ranked = scores;
        bestMove = scores[0].m;
        // 下一輪先搜尋上一輪最佳的走法
        moves.splice(0, moves.length, ...scores.map(x => x.m));
        if (Math.abs(scores[0].s) > 900) break;
      } catch (err) {
        if (err instanceof Timeout) break;
        throw err;
      }
    }
    if (randomness > 0 && ranked.length > 1) {
      const pool = ranked.filter(x => x.s >= ranked[0].s - randomness);
      return pool[Math.floor(Math.random() * pool.length)].m;
    }
    return bestMove;
  }
}
