import type {
  GameState, Move, MoveRule, Piece, PieceDef, RegionName, Result, Side, VariantDef,
} from './types';

const DUMMY = '__dummy__';

/** 由走法規則自動估算棋子價值（以空棋盤中央可到達格數為準） */
export function estimateValue(def: PieceDef): number {
  if (def.value !== undefined) return def.value;
  let m = 0;
  for (const r of def.moves) {
    const steps = r.range === 0 ? 4 : r.range;
    const w = r.mode === 'both' ? 1 : 0.5;
    m += r.vectors.length * Math.min(steps, 4) * w * (r.when || r.initial ? 0.4 : 1);
  }
  return Math.round((0.3 * m + 0.5) * 10) / 10;
}

export class Engine {
  readonly v: VariantDef;
  readonly W: number;
  readonly H: number;
  readonly N: number;
  private palaceIdx: Int8Array;
  private palaceCenter: number[];
  readonly values: Record<string, number> = {};

  constructor(v: VariantDef) {
    this.v = v;
    this.W = v.board.width;
    this.H = v.board.height;
    this.N = this.W * this.H;
    this.palaceIdx = new Int8Array(this.N).fill(-1);
    this.palaceCenter = [];
    (v.board.palaces ?? []).forEach((p, i) => {
      for (let y = p.y; y < p.y + p.h; y++)
        for (let x = p.x; x < p.x + p.w; x++)
          if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.palaceIdx[y * this.W + x] = i;
      this.palaceCenter[i] = (p.y + Math.floor(p.h / 2)) * this.W + p.x + Math.floor(p.w / 2);
    });
    for (const id in v.pieces) this.values[id] = estimateValue(v.pieces[id]);
  }

  def(type: string): PieceDef {
    return this.v.pieces[type];
  }

  /** 從該方視角算起的排數（0 = 自己的底線） */
  rank(sq: number, side: Side): number {
    const y = Math.floor(sq / this.W);
    return side === 0 ? y : this.H - 1 - y;
  }

  inRegion(sq: number, side: Side, region: RegionName): boolean {
    switch (region) {
      case 'palace': {
        const i = this.palaceIdx[sq];
        return i >= 0 && this.v.board.palaces![i].side === side;
      }
      case 'ownHalf':
        return this.rank(sq, side) < this.H / 2;
      case 'enemyHalf':
        return this.rank(sq, side) >= this.H / 2;
      case 'promoZone':
        return this.v.rules.promotionZone > 0 && this.rank(sq, side) >= this.H - this.v.rules.promotionZone;
    }
  }

  /** 九宮斜線：兩點在同一九宮內，且其中一點為九宮中心 */
  private palaceDiagOk(a: number, b: number): boolean {
    const i = this.palaceIdx[a];
    if (i < 0 || this.palaceIdx[b] !== i) return false;
    const c = this.palaceCenter[i];
    return a === c || b === c;
  }

  initialState(): GameState {
    const board: (Piece | null)[] = new Array(this.N).fill(null);
    for (const p of this.v.setup) {
      if (p.x < this.W && p.y < this.H && this.v.pieces[p.type])
        board[p.y * this.W + p.x] = { type: p.type, side: p.side };
    }
    return { board, turn: 0, hands: [{}, {}], ep: -1, halfmoveClock: 0, passes: 0, ply: 0 };
  }

  // ---------------- 走法生成 ----------------

  private pushWithPromo(out: Move[], side: Side, def: PieceDef, m: Move) {
    const promos = def.promotesTo;
    if (promos && promos.length && this.v.rules.promotionZone > 0 &&
      (this.inRegion(m.from, side, 'promoZone') || this.inRegion(m.to, side, 'promoZone'))) {
      const must = def.promoForced ||
        (def.mustPromoteDepth !== undefined && this.H - 1 - this.rank(m.to, side) < def.mustPromoteDepth);
      for (const p of promos) if (this.v.pieces[p]) out.push({ ...m, promo: p });
      if (!must) out.push(m);
      return;
    }
    out.push(m);
  }

  /** 產生單一棋子的擬合法走法（不考慮自己是否被將軍） */
  genPiece(st: GameState, sq: number, out: Move[]) {
    const pc = st.board[sq]!;
    const def = this.def(pc.type);
    if (!def) return;
    const side = pc.side;
    const W = this.W, H = this.H;
    const x0 = sq % W, y0 = (sq / W) | 0;
    const fwd = side === 0 ? 1 : -1;

    for (const r of def.moves) {
      if (r.initial && pc.moved) continue;
      if (r.lostIfEnemyOnLine && pc.lost) continue;
      if (r.when && !this.inRegion(sq, side, r.when)) continue;
      const start = out.length;
      for (const [vx, vy] of r.vectors) {
        const dx = vx, dy = vy * fwd;
        if (r.hop) this.genHop(st, sq, pc, def, r, dx, dy, out);
        else if (r.range === 1) {
          const x = x0 + dx, y = y0 + dy;
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const to = y * W + x;
          if (r.palaceDiag && dx !== 0 && dy !== 0 && !this.palaceDiagOk(sq, to)) continue;
          if (r.confine && !this.inRegion(to, side, r.confine)) continue;
          if (r.lame && !this.pathClear(st, x0, y0, dx, dy)) continue;
          this.addTarget(st, sq, to, pc, def, r, out);
        } else {
          const max = r.range === 0 ? 99 : r.range;
          let x = x0, y = y0, prev = sq;
          for (let k = 0; k < max; k++) {
            x += dx; y += dy;
            if (x < 0 || y < 0 || x >= W || y >= H) break;
            const to = y * W + x;
            if (r.palaceDiag && dx !== 0 && dy !== 0 && !this.palaceDiagOk(prev, to)) break;
            if (r.confine && !this.inRegion(to, side, r.confine)) break;
            if (!this.addTarget(st, sq, to, pc, def, r, out)) break;
            prev = to;
          }
        }
      }
      if (r.notInCheck) for (let i = start; i < out.length; i++) out[i].needNoCheck = true;
    }
  }

  /** 加入目標格；回傳是否可繼續滑行 */
  private addTarget(st: GameState, from: number, to: number, pc: Piece, def: PieceDef, r: MoveRule, out: Move[]): boolean {
    const t = st.board[to];
    if (!t) {
      if (r.mode !== 'capture') this.pushWithPromo(out, pc.side, def, { from, to, type: pc.type });
      else if (def.enPassant && to === st.ep) {
        const victim = to - (pc.side === 0 ? 1 : -1) * this.W;
        const vp = st.board[victim];
        if (vp && vp.side !== pc.side)
          this.pushWithPromo(out, pc.side, def, { from, to, type: pc.type, capture: vp, ep: victim });
      }
      return true;
    }
    if (t.side !== pc.side && r.mode !== 'move')
      this.pushWithPromo(out, pc.side, def, { from, to, type: pc.type, capture: t });
    return false;
  }

  /** 蹩腳檢查：先沿主軸直走一步，再斜走，途中格子都必須為空 */
  private pathClear(st: GameState, x0: number, y0: number, dx: number, dy: number): boolean {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const n = Math.max(ax, ay);
    if (n <= 1) return true;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    let x = x0, y = y0;
    for (let i = 0; i < n - 1; i++) {
      if (i === 0 && ax !== ay) {
        if (ax > ay) x += sx; else y += sy;
      } else { x += sx; y += sy; }
      if (st.board[y * this.W + x]) return false;
    }
    return true;
  }

  private genHop(st: GameState, sq: number, pc: Piece, def: PieceDef, r: MoveRule, dx: number, dy: number, out: Move[]) {
    const W = this.W, H = this.H;
    const janggi = r.hop === 'janggi';
    const max = r.range === 0 ? 99 : r.range;
    let x = sq % W, y = (sq / W) | 0, prev = sq;
    let screened = false;
    for (let k = 0; k < max; k++) {
      x += dx; y += dy;
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const to = y * W + x;
      if (r.palaceDiag && dx !== 0 && dy !== 0 && !this.palaceDiagOk(prev, to)) return;
      prev = to;
      const t = st.board[to];
      const inConf = !r.confine || this.inRegion(to, pc.side, r.confine);
      if (!screened) {
        if (t) {
          if (janggi && t.type === pc.type) return;
          screened = true;
        } else if (!janggi && r.mode !== 'capture' && inConf) {
          this.pushWithPromo(out, pc.side, def, { from: sq, to, type: pc.type });
        }
      } else {
        if (t) {
          if (t.side !== pc.side && r.mode !== 'move' && inConf && !(janggi && t.type === pc.type))
            this.pushWithPromo(out, pc.side, def, { from: sq, to, type: pc.type, capture: t });
          return;
        }
        if (janggi && r.mode !== 'capture' && inConf)
          this.pushWithPromo(out, pc.side, def, { from: sq, to, type: pc.type });
      }
    }
  }

  private genDrops(st: GameState, side: Side, out: Move[]) {
    const hand = st.hands[side];
    for (const type in hand) {
      if (!hand[type]) continue;
      const def = this.def(type);
      if (!def) continue;
      let blockedFiles: Set<number> | null = null;
      if (def.nifu) {
        blockedFiles = new Set();
        for (let i = 0; i < this.N; i++) {
          const p = st.board[i];
          if (p && p.side === side && p.type === type) blockedFiles.add(i % this.W);
        }
      }
      for (let to = 0; to < this.N; to++) {
        if (st.board[to]) continue;
        if (def.mustPromoteDepth !== undefined && this.H - 1 - this.rank(to, side) < def.mustPromoteDepth) continue;
        if (blockedFiles && blockedFiles.has(to % this.W)) continue;
        out.push({ from: -1, to, type });
      }
    }
  }

  pseudoMoves(st: GameState, side: Side): Move[] {
    const out: Move[] = [];
    for (let sq = 0; sq < this.N; sq++) {
      const p = st.board[sq];
      if (p && p.side === side) this.genPiece(st, sq, out);
    }
    if (this.v.rules.drops) this.genDrops(st, side, out);
    return out;
  }

  // ---------------- 將軍判定 ----------------

  /** bySide 是否能攻擊 sq（若 sq 為空會暫放一枚假棋子） */
  isAttacked(st: GameState, sq: number, bySide: Side): boolean {
    let s = st;
    if (!st.board[sq] || st.board[sq]!.side === bySide) {
      const board = st.board.slice();
      board[sq] = { type: DUMMY, side: (1 - bySide) as Side };
      s = { ...st, board };
    }
    const out: Move[] = [];
    for (let i = 0; i < this.N; i++) {
      const p = s.board[i];
      if (p && p.side === bySide) {
        out.length = 0;
        this.genPiece(s, i, out);
        for (const m of out) if (m.to === sq && m.capture) return true;
      }
    }
    return false;
  }

  royals(st: GameState, side: Side): number[] {
    const r: number[] = [];
    for (let i = 0; i < this.N; i++) {
      const p = st.board[i];
      if (p && p.side === side && this.v.pieces[p.type]?.royal) r.push(i);
    }
    return r;
  }

  inCheck(st: GameState, side: Side): boolean {
    const mine = this.royals(st, side);
    if (!mine.length) return false;
    const opp = (1 - side) as Side;
    if (this.v.rules.flyingGeneral) {
      for (const a of mine) for (const b of this.royals(st, opp)) {
        if (a % this.W !== b % this.W) continue;
        const lo = Math.min(a, b), hi = Math.max(a, b);
        let clear = true;
        for (let i = lo + this.W; i < hi; i += this.W) if (st.board[i]) { clear = false; break; }
        if (clear) return true;
      }
    }
    const set = new Set(mine);
    const out: Move[] = [];
    for (let i = 0; i < this.N; i++) {
      const p = st.board[i];
      if (p && p.side === opp) {
        out.length = 0;
        this.genPiece(st, i, out);
        for (const m of out) if (m.capture && set.has(m.to)) return true;
      }
    }
    return false;
  }

  // ---------------- 執行走法 ----------------

  makeMove(st: GameState, m: Move): GameState {
    const side = st.turn;
    const board = st.board.slice();
    const hands: [Record<string, number>, Record<string, number>] = [st.hands[0], st.hands[1]];
    const next: GameState = {
      board, hands, turn: (1 - side) as Side, ep: -1,
      halfmoveClock: st.halfmoveClock + 1, passes: 0, ply: (st.ply ?? 0) + 1,
    };
    if (m.pass) {
      next.passes = st.passes + 1;
      return this.afterMove(st, next, m, null);
    }
    if (m.from < 0) {
      const h = { ...hands[side] };
      h[m.type] = (h[m.type] ?? 0) - 1;
      if (!h[m.type]) delete h[m.type];
      hands[side] = h;
      board[m.to] = { type: m.type, side, moved: true };
      return this.afterMove(st, next, m, null);
    }
    const pc = board[m.from]!;
    const def = this.def(pc.type);
    const capSq = m.ep !== undefined ? m.ep : m.to;
    const cap = board[capSq];
    if (cap) {
      next.halfmoveClock = 0;
      if (this.v.rules.drops && this.v.pieces[cap.type]) {
        const base = this.def(cap.type).demotesTo ?? cap.type;
        const h = { ...hands[side] };
        h[base] = (h[base] ?? 0) + 1;
        hands[side] = h;
      }
      board[capSq] = null;
    }
    if (def?.pawn) next.halfmoveClock = 0;
    board[m.from] = null;
    board[m.to] = { type: m.promo ?? pc.type, side, moved: true };
    if (m.castle) {
      const rook = board[m.castle.from]!;
      board[m.castle.from] = null;
      board[m.castle.to] = { ...rook, moved: true };
    }
    if (def?.enPassant) {
      const fx = m.from % this.W, tx = m.to % this.W;
      const fy = (m.from / this.W) | 0, ty = (m.to / this.W) | 0;
      if (fx === tx && Math.abs(ty - fy) === 2) next.ep = ((fy + ty) / 2) * this.W + fx;
    }
    // 敵子走到某棋子的橫排／直線上，使其特權失效
    const tx = m.to % this.W, ty = (m.to / this.W) | 0;
    for (let i = 0; i < this.N; i++) {
      const q = board[i];
      if (!q || q.side === side || q.lost || q.moved) continue;
      if (i % this.W !== tx && ((i / this.W) | 0) !== ty) continue;
      if (this.def(q.type)?.moves.some(r => r.lostIfEnemyOnLine?.includes(board[m.to]!.type)))
        board[i] = { ...q, lost: true };
    }
    return this.afterMove(st, next, m, cap);
  }

  // ---------------- 數步規則（移植自 Fairy-Stockfish position.cpp） ----------------

  private material(st: GameState) {
    const n: [number, number] = [0, 0];
    const role = [{ rook: 0, bishop: 0, knight: 0, queen: 0 }, { rook: 0, bishop: 0, knight: 0, queen: 0 }];
    let pawns = 0;
    for (const p of st.board) {
      if (!p) continue;
      n[p.side]++;
      const d = this.v.pieces[p.type];
      if (d?.pawn) pawns++;
      if (d?.countAs) role[p.side][d.countAs]++;
    }
    return { n, role, pawns };
  }

  /** 該方若開始數步，限制為幾回合（0 = 不能數） */
  countLimit(st: GameState, side: Side): number {
    const { n, role, pawns } = this.material(st);
    const opp = (1 - side) as Side;
    const r = role[opp];
    if (this.v.rules.counting === 'makruk') {
      if (pawns || n[opp] === 1) return 0;
      if (n[side] > 1) return 64;
      if (r.rook > 1) return 8;
      if (r.rook === 1) return 16;
      if (r.bishop > 1) return 22;
      if (r.knight > 1) return 32;
      if (r.bishop === 1) return 44;
      return 64;
    }
    if (this.v.rules.counting === 'cambodian') {
      if (n[side] > 3 || n[opp] === 1) return 0;
      if (n[side] > 1) return 63;
      if (pawns) return 0;
      if (r.rook > 1) return 7;
      if (r.rook === 1) return 15;
      if (r.bishop > 1) return 21;
      if (r.knight > 1) return 31;
      if (r.bishop === 1) return 43;
      return 63;
    }
    return 0;
  }

  private afterMove(st: GameState, next: GameState, m: Move, captured: Piece | null): GameState {
    if (st.boardCount) next.boardCount = { side: st.boardCount.side, ply: st.boardCount.ply + 1 };
    if (!this.v.rules.counting) return next;
    const us = st.turn, them = next.turn;
    let limit = st.count?.limit ?? 0;
    let ply = (st.count?.ply ?? 0) + (limit ? 1 : 0);
    const { n, pawns } = this.material(next);
    const total = n[0] + n[1];
    if (captured && this.v.pieces[captured.type]?.pawn && n[us] === 1 && !pawns && this.countLimit(next, us)) {
      limit = 2 * this.countLimit(next, us);
      ply = 2 * total - 1;
    }
    if ((!limit || ((captured || m.promo) && n[them] === 1)) && this.countLimit(next, them)) {
      limit = 2 * this.countLimit(next, them);
      ply = n[them] > 1 ? 0 : 2 * total;
    }
    if (limit) next.count = { limit, ply };
    return next;
  }

  /** 該方現在能否宣告開始棋盤數 */
  canDeclareCount(st: GameState, side: Side): boolean {
    if (!this.v.rules.counting || st.boardCount) return false;
    const { n, pawns } = this.material(st);
    if (n[side] <= 1) return false; // 只剩王時是棋子數，自動開始
    if (this.v.rules.counting === 'makruk' && pawns) return false;
    return this.countLimit(st, side) > 0;
  }

  declareCount(st: GameState, side: Side): GameState {
    const next: GameState = { ...st, boardCount: { side, ply: 1 } };
    if (!next.count) next.count = { limit: 2 * this.countLimit(st, side), ply: 0 };
    return next;
  }

  stopCount(st: GameState): GameState {
    return { ...st, boardCount: undefined };
  }

  /** 目前生效的數步（顯示用與判和用） */
  countStatus(st: GameState): { kind: 'board' | 'pieces'; side: Side; ply: number; limit: number } | null {
    if (!this.v.rules.counting || !st.count) return null;
    const { n, pawns } = this.material(st);
    const boardPly = st.boardCount?.ply ?? 0;
    const shorter = this.v.rules.counting === 'cambodian' && 126 - boardPly < st.count.limit - st.count.ply;
    const limit = shorter ? 126 : st.count.limit;
    const piecesActive = !pawns && (n[0] <= 1 || n[1] <= 1) && !shorter;
    if (piecesActive) return { kind: 'pieces', side: n[0] <= 1 ? 0 : 1, ply: st.count.ply, limit };
    if (st.boardCount) return { kind: 'board', side: st.boardCount.side, ply: boardPly, limit };
    return null;
  }

  // ---------------- 合法走法 ----------------

  private genCastling(st: GameState, side: Side, out: Move[]) {
    const W = this.W;
    for (const k of this.royals(st, side)) {
      const kp = st.board[k]!;
      if (kp.moved) continue;
      const ky = (k / W) | 0, kx = k % W;
      let checked: boolean | null = null;
      for (let x = 0; x < W; x++) {
        const sq = ky * W + x;
        const p = st.board[sq];
        if (!p || p.side !== side || p.moved || !this.def(p.type)?.castlePartner) continue;
        if (Math.abs(x - kx) < 3) continue;
        const dir = Math.sign(x - kx);
        let clear = true;
        for (let i = kx + dir; i !== x; i += dir) if (st.board[ky * W + i]) { clear = false; break; }
        if (!clear) continue;
        if (checked === null) checked = this.inCheck(st, side);
        if (checked) break;
        const opp = (1 - side) as Side;
        if (this.isAttacked(st, ky * W + kx + dir, opp)) continue;
        out.push({ from: k, to: ky * W + kx + 2 * dir, type: kp.type, castle: { from: sq, to: ky * W + kx + dir } });
      }
    }
  }

  legalMoves(st: GameState, firstOnly = false): Move[] {
    const side = st.turn;
    const rules = this.v.rules;
    const pseudo = this.pseudoMoves(st, side);
    if (rules.castling) this.genCastling(st, side, pseudo);
    if (rules.win !== 'checkmate') {
      if (rules.allowPass) pseudo.push({ from: -1, to: -1, type: '', pass: true });
      return pseudo;
    }
    const out: Move[] = [];
    const opp = (1 - side) as Side;
    let checkedNow: boolean | null = null;
    for (const m of pseudo) {
      if (m.needNoCheck) {
        if (checkedNow === null) checkedNow = this.inCheck(st, side);
        if (checkedNow) continue;
      }
      const next = this.makeMove(st, m);
      if (this.inCheck(next, side)) continue;
      const restrictMate = (m.from < 0 && this.def(m.type)?.noDropMate) ||
        (m.from >= 0 && rules.noMateBy?.includes(m.type));
      if (restrictMate && this.inCheck(next, opp) && this.legalMoves(next, true).length === 0) continue;
      out.push(m);
      if (firstOnly) return out;
    }
    if (rules.allowPass && !this.inCheck(st, side)) out.push({ from: -1, to: -1, type: '', pass: true });
    return out;
  }

  // ---------------- 勝負 ----------------

  /** 這種棋子「是否移動過」會影響之後的權利（入堡、第一步特殊走法） */
  private rightsMatter(type: string): boolean {
    const d = this.v.pieces[type];
    if (!d) return false;
    return !!(d.castlePartner || (d.royal && this.v.rules.castling) || d.moves.some(r => r.initial));
  }

  /** 局面雜湊：用於判斷重複局面（同樣的棋子位置、輪走方、手駒，以及相同的走棋權利） */
  private hashCache = new WeakMap<GameState, string>();

  hash(st: GameState): string {
    const cached = this.hashCache.get(st);
    if (cached !== undefined) return cached;
    let s = '';
    for (const p of st.board) {
      if (!p) { s += '.'; continue; }
      s += p.type + (p.side ? '#' : '@');
      if (this.rightsMatter(p.type)) s += (p.moved ? 'm' : '') + (p.lost ? 'l' : '');
    }
    // 過路兵只有在真的能吃時才算局面差異
    const ep = st.ep >= 0 && this.legalMoves(st).some(m => m.ep !== undefined) ? st.ep : -1;
    const h = s + st.turn + JSON.stringify(st.hands) + ep;
    this.hashCache.set(st, h);
    return h;
  }

  /** 同一局面在對局紀錄中出現的位置（history 最後一項必須是 st） */
  private repeatIndices(st: GameState, history?: GameState[]): number[] {
    if (!history?.length) return [0];
    const h = this.hash(st);
    const idx: number[] = [];
    history.forEach((s, i) => { if (this.hash(s) === h) idx.push(i); });
    return idx;
  }

  result(st: GameState, history?: GameState[]): Result {
    const side = st.turn, opp = (1 - side) as Side;
    const rules = this.v.rules;
    const reps = this.repeatIndices(st, history);
    const repeats = reps.length;
    if (rules.win === 'captureRoyal') {
      for (const s of [side, opp] as Side[]) if (!this.royals(st, s).length)
        return { kind: 'win', winner: (1 - s) as Side, reason: '王被吃掉' };
    }
    if (rules.win === 'captureAll') {
      for (const s of [side, opp] as Side[]) {
        const any = st.board.some(p => p && p.side === s) || Object.values(st.hands[s]).some(n => n > 0);
        if (!any) return { kind: 'win', winner: (1 - s) as Side, reason: '棋子全被吃光' };
      }
    }
    if (rules.bareKing) {
      // 對應 Fairy-Stockfish：extinctionPieceCount = 1、extinctionOpponentPieceCount = 2、extinctionClaim
      const cnt = ([0, 1] as Side[]).map(s =>
        st.board.filter(p => p && p.side === s).length + Object.values(st.hands[s]).reduce((a, b) => a + b, 0));
      if (cnt[0] <= 1 && cnt[1] <= 1) return { kind: 'draw', reason: '雙方都只剩王' };
      for (const s of [0, 1] as Side[])
        if (cnt[s] <= 1 && cnt[1 - s] >= 2 + (s === side ? 1 : 0))
          return { kind: 'win', winner: (1 - s) as Side, reason: '光王' };
    }
    const check = rules.win === 'checkmate' && this.inCheck(st, side);
    if (this.legalMoves(st, true).length === 0) {
      if (check && st.boardCount && st.boardCount.side === opp)
        return { kind: 'draw', reason: '數步的一方將死對方（和棋）' };
      if (check) return { kind: 'win', winner: opp, reason: '將死' };
      if (rules.stalemate === 'draw') return { kind: 'draw', reason: '無子可動（和棋）' };
      return { kind: 'win', winner: rules.stalemate === 'loss' ? opp : side, reason: '無子可動' };
    }
    const cs = this.countStatus(st);
    if (cs && cs.ply > cs.limit) return { kind: 'draw', reason: `數步到達上限（${cs.limit / 2} 回合）` };
    if (rules.repetition > 0 && repeats >= rules.repetition) {
      if (rules.perpetualCheckLoses && history) {
        // 從第一次出現到現在的手順中，若某方每一步都在將軍 → 該方判負
        const first = reps[0], last = history.length - 1;
        for (const s of [0, 1] as Side[]) {
          let moves = 0, checks = 0;
          for (let j = first + 1; j <= last; j++) {
            if (history[j - 1].turn !== s) continue;
            moves++;
            if (this.inCheck(history[j], (1 - s) as Side)) checks++;
          }
          if (moves > 0 && checks === moves) return { kind: 'win', winner: (1 - s) as Side, reason: '連續將軍造成重複局面（將軍方判負）' };
        }
      }
      return { kind: 'draw', reason: `同一局面出現 ${repeats} 次` };
    }
    if (rules.maxPlies && (st.ply ?? 0) >= rules.maxPlies && !check)
      return { kind: 'draw', reason: `達到 ${rules.maxPlies} 手（持將棋，無勝負）` };
    if (rules.deadPosition && this.isDeadByMaterial(st)) return { kind: 'draw', reason: '子力不足，雙方都無法將死' };
    if (rules.moveLimit > 0 && st.halfmoveClock >= rules.moveLimit) return { kind: 'draw', reason: `${rules.moveLimit / 2} 回合無吃子` };
    if (st.passes >= 2) return { kind: 'draw', reason: '雙方連續停著' };
    return { kind: 'ongoing', check };
  }

  // ---------------- 和棋要求（FIDE 9.2、9.3） ----------------

  /** 目前局面輪走方可以提出的和棋要求理由 */
  claimReason(st: GameState, history: GameState[]): string | null {
    const r = this.v.rules;
    if (r.repetitionClaim && this.repeatIndices(st, history).length >= r.repetitionClaim) return `同一局面出現 ${r.repetitionClaim} 次`;
    if (r.moveLimitClaim && st.halfmoveClock >= r.moveLimitClaim) return `${r.moveLimitClaim / 2} 回合無吃子、無兵移動`;
    return null;
  }

  /** 子力不足的死局：只剩王、或只剩一個輕子、或只剩同色格的象 */
  isDeadByMaterial(st: GameState): boolean {
    let minors = 0, knights = 0;
    const bishopColors = new Set<number>();
    for (let i = 0; i < this.N; i++) {
      const p = st.board[i];
      if (!p) continue;
      const d = this.v.pieces[p.type];
      if (d?.royal) continue;
      if (!d?.minor) return false;
      minors++;
      if (d.minor === 'knight') knights++;
      else bishopColors.add(((i % this.W) + Math.floor(i / this.W)) % 2);
    }
    if (minors <= 1) return true;
    return knights === 0 && bishopColors.size === 1;
  }

  // ---------------- 持將棋（日本將棋聯盟 対局規則 第 9 条） ----------------

  private piecePoints(type: string): number {
    const d = this.v.pieces[type];
    return d?.royal ? 0 : d?.points ?? 1;
  }

  /** 合意持將棋時的點數：己方所有棋子（盤上與持駒，不含玉） */
  impasseTotal(st: GameState, side: Side): number {
    let pts = 0;
    for (const p of st.board) if (p && p.side === side) pts += this.piecePoints(p.type);
    for (const [t, n] of Object.entries(st.hands[side])) pts += this.piecePoints(t) * n;
    return pts;
  }

  /** 入玉：至少一方的玉在敵陣（第 9 条第 1～3 項的前提） */
  anyKingEntered(st: GameState): boolean {
    return ([0, 1] as Side[]).some(s => this.royals(st, s).some(k => this.inRegion(k, s, 'promoZone')));
  }

  agreeImpasse(st: GameState): Result {
    const pts = [this.impasseTotal(st, 0), this.impasseTotal(st, 1)];
    const lose = ([0, 1] as Side[]).filter(s => pts[s] < 24);
    const detail = `${this.v.sideNames[0]} ${pts[0]} 點、${this.v.sideNames[1]} ${pts[1]} 點`;
    if (lose.length === 1) return { kind: 'win', winner: (1 - lose[0]) as Side, reason: `持將棋：${detail}，不足 24 點的一方負` };
    if (lose.length === 2) return { kind: 'draw', reason: `持將棋：${detail}，雙方皆不足 24 點` };
    return { kind: 'draw', reason: `持將棋：${detail}，無勝負（交換先後重下）` };
  }

  /** 入玉宣言（第 9 条第 5 項）：檢查條件並計算結果 */
  impasseDeclaration(st: GameState): { conditions: [string, boolean][]; points: number; result: Result } {
    const side = st.turn;
    const kings = this.royals(st, side);
    let inCamp = 0, pts = 0;
    for (let i = 0; i < this.N; i++) {
      const p = st.board[i];
      if (!p || p.side !== side || this.v.pieces[p.type]?.royal) continue;
      if (this.inRegion(i, side, 'promoZone')) { inCamp++; pts += this.piecePoints(p.type); }
    }
    for (const [t, n] of Object.entries(st.hands[side])) pts += this.piecePoints(t) * n;
    const conditions: [string, boolean][] = [
      ['玉在敵陣三段以內', kings.length > 0 && kings.every(k => this.inRegion(k, side, 'promoZone'))],
      [`敵陣三段以內有 10 枚以上己方棋子（目前 ${inCamp} 枚）`, inCamp >= 10],
      ['玉沒有被將軍', !this.inCheck(st, side)],
      [`點數 24 點以上（目前 ${pts} 點，31 點以上勝）`, pts >= 24],
    ];
    const name = this.v.sideNames[side];
    let result: Result;
    if (conditions.some(c => !c[1])) result = { kind: 'win', winner: (1 - side) as Side, reason: `${name}入玉宣言不成立，宣言方負` };
    else if (pts >= 31) result = { kind: 'win', winner: side, reason: `${name}入玉宣言成立（${pts} 點）` };
    else result = { kind: 'draw', reason: `${name}入玉宣言 ${pts} 點，無勝負（交換先後重下）` };
    return { conditions, points: pts, result };
  }

  // ---------------- 記譜 ----------------

  sqName(sq: number): string {
    return String.fromCharCode(97 + (sq % this.W)) + (((sq / this.W) | 0) + 1);
  }

  notation(m: Move, side: Side): string {
    if (m.pass) return '停著';
    const label = this.def(m.type)?.labels[side] ?? m.type;
    if (m.castle) return m.castle.from % this.W > m.from % this.W ? 'O-O' : 'O-O-O';
    if (m.from < 0) return `${label}*${this.sqName(m.to)}`;
    let s = `${label}${this.sqName(m.from)}${m.capture ? '×' : '-'}${this.sqName(m.to)}`;
    if (m.promo) s += '=' + (this.def(m.promo)?.labels[side] ?? m.promo);
    return s;
  }
}
