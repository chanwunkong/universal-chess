// 中國象棋 AXF 長將、長捉判定。
// 逐段移植自 Fairy-Stockfish（src/position.cpp：Position::chased()、slider_blockers()、is_optional_game_end() 的 n-fold 段落），
// PyChess 的中國象棋即以此裁決。函式與變數名稱盡量保留原名以便對照。
import type { Engine } from './engine';
import type { GameState, Move, Piece, PieceDef, Result, Side, Text } from './types';

const L = (zh: string, en: string): Text => ({ zh, en });

type Role = NonNullable<PieceDef['xqRole']>;
type Sq = number;
type BB = Set<Sq>;

const DUMMY = '__xq_dummy__';

export class XqChase {
  private e: Engine;
  private chasedCache = new WeakMap<GameState, BB>();
  private blockersCache = new WeakMap<GameState, [BB, BB]>();

  constructor(e: Engine) {
    this.e = e;
  }

  private role(p: Piece | null | undefined): Role | undefined {
    return p ? this.e.v.pieces[p.type]?.xqRole : undefined;
  }

  private st(board: (Piece | null)[], turn: Side): GameState {
    return { board, turn, hands: [{}, {}], ep: -1, halfmoveClock: 0, passes: 0 };
  }

  /** 棋盤上 side 方、role 為指定兵種的格子 */
  private pieces(board: (Piece | null)[], side: Side, ...roles: Role[]): BB {
    const b: BB = new Set();
    board.forEach((p, i) => { if (p && p.side === side && (!roles.length || roles.includes(this.role(p)!))) b.add(i); });
    return b;
  }

  private kingSq(board: (Piece | null)[], side: Side): Sq {
    return board.findIndex(p => p && p.side === side && this.role(p) === 'king');
  }

  /** 已過河的兵（promoted_soldiers） */
  private promotedSoldiers(board: (Piece | null)[], side: Side): BB {
    const b: BB = new Set();
    for (const s of this.pieces(board, side, 'soldier')) if (this.e.inRegion(s, side, 'enemyHalf')) b.add(s);
    return b;
  }

  /**
   * attacks_bb(side, type, sq, occupancy) 與已佔據格子的交集：
   * 在 occ 這個盤面上把一枚 side 方的 type 放在 sq，回傳它能攻擊（不論敵我）的「有子」格子。
   */
  private attackSet(occ: (Piece | null)[], sq: Sq, side: Side, type: string): BB {
    const board = occ.map((p, i) => (p && i !== sq ? { ...p, side: (1 - side) as Side } : p));
    board[sq] = { type, side };
    const out: Move[] = [];
    this.e.genPiece(this.st(board, side), sq, out);
    return new Set(out.filter(m => m.capture).map(m => m.to));
  }

  /** attackers_to(s, occupancy, color)：occ 盤面上 color 方能攻擊 s 的棋子 */
  private attackersTo(occ: (Piece | null)[], s: Sq, color: Side): BB {
    const board = occ.slice();
    board[s] = { type: DUMMY, side: (1 - color) as Side };
    const st = this.st(board, color);
    const b: BB = new Set();
    const out: Move[] = [];
    board.forEach((p, i) => {
      if (!p || p.side !== color || p.type === DUMMY) return;
      out.length = 0;
      this.e.genPiece(st, i, out);
      if (out.some(m => m.capture && m.to === s)) b.add(i);
    });
    return b;
  }

  private between(a: Sq, b: Sq): Sq[] {
    const W = this.e.W;
    const ax = a % W, ay = Math.floor(a / W), bx = b % W, by = Math.floor(b / W);
    if (ax !== bx && ay !== by) return [];
    const dx = Math.sign(bx - ax), dy = Math.sign(by - ay);
    const r: Sq[] = [];
    for (let x = ax + dx, y = ay + dy; x !== bx || y !== by; x += dx, y += dy) r.push(y * W + x);
    return r;
  }

  /** 馬從 h 跳到 s 時的馬腳 */
  private horseLeg(h: Sq, s: Sq): Sq | null {
    const W = this.e.W;
    const dx = (s % W) - (h % W), dy = Math.floor(s / W) - Math.floor(h / W);
    if (!((Math.abs(dx) === 1 && Math.abs(dy) === 2) || (Math.abs(dx) === 2 && Math.abs(dy) === 1))) return null;
    return Math.abs(dx) === 2 ? h + Math.sign(dx) : h + Math.sign(dy) * W;
  }

  /** slider_blockers：side 方的王被 ~side 方的車、炮、馬攻擊時，擋在中間的棋子（雙方都算） */
  blockersForKing(board: (Piece | null)[], side: Side): BB {
    const s = this.kingSq(board, side);
    const blockers: BB = new Set();
    if (s < 0) return blockers;
    const opp = (1 - side) as Side;
    const W = this.e.W;
    const snipers: Sq[] = [];
    const slidingSnipers: BB = new Set();
    for (let i = 0; i < board.length; i++) {
      const p = board[i];
      if (!p || p.side !== opp) continue;
      const r = this.role(p);
      if (r === 'rook' || r === 'cannon') {
        if (i % W !== s % W && Math.floor(i / W) !== Math.floor(s / W)) continue;
        if (this.attackSet(board, i, opp, p.type).has(s)) continue; // 已經在攻擊的不是 sniper
        snipers.push(i);
        if (r === 'rook') slidingSnipers.add(i);
      } else if (r === 'horse') {
        if (this.horseLeg(i, s) === null) continue;
        if (this.attackSet(board, i, opp, p.type).has(s)) continue;
        snipers.push(i);
      }
    }
    for (const sn of snipers) {
      const r = this.role(board[sn]);
      let b: Sq[];
      if (r === 'horse') {
        const leg = this.horseLeg(sn, s)!;
        b = board[leg] ? [leg] : [];
      } else {
        const isHopper = r === 'cannon';
        b = this.between(s, sn).filter(q => board[q] && (isHopper || !slidingSnipers.has(q)));
      }
      if (b.length && (b.length === 1 || (r === 'cannon' && b.length === 2))) b.forEach(q => blockers.add(q));
    }
    return blockers;
  }

  private blockers(st: GameState): [BB, BB] {
    let c = this.blockersCache.get(st);
    if (!c) {
      c = [this.blockersForKing(st.board, 0), this.blockersForKing(st.board, 1)];
      this.blockersCache.set(st, c);
    }
    return c;
  }

  /** Position::chased()：上一步造成的新「捉」，回傳被捉的（輪走方）棋子格子 */
  chased(st: GameState, prev: GameState | undefined): BB {
    const cached = this.chasedCache.get(st);
    if (cached) return cached;
    const b: BB = new Set();
    this.chasedCache.set(st, b);
    if (!st.last || st.last.from < 0) return b;
    const board = st.board;
    const stm = st.turn, them = (1 - stm) as Side;
    const W = this.e.W;
    const flyingGeneral = !!this.e.v.rules.flyingGeneral;

    const pins: BB = new Set(this.blockers(st)[stm]);
    if (flyingGeneral) {
      const ek = this.kingSq(board, them);
      if (ek >= 0) {
        const kingFilePieces = [...this.pieces(board, stm)].filter(q => q % W === ek % W);
        const nonKings = kingFilePieces.filter(q => this.role(board[q]) !== 'king');
        if (kingFilePieces.some(q => this.role(board[q]) === 'king') && nonKings.length <= 1) nonKings.forEach(q => pins.add(q));
      }
    }
    const stmKing = this.kingSq(board, stm), themKing = this.kingSq(board, them);
    const excluded = new Set([...this.pieces(board, stm, 'king', 'soldier')].filter(q => !this.promotedSoldiers(board, stm).has(q)));

    const addChased = (attackerSq: Sq, attackerRole: Role, attacksIn: BB) => {
      let attacks = new Set(attacksIn);
      if (![...attacks].some(q => !b.has(q))) return;
      // 不算攻擊未過河的兵與將（將軍）
      for (const q of excluded) attacks.delete(q);
      // 攻擊較強的棋子
      if (attackerRole === 'horse' || attackerRole === 'cannon')
        for (const q of attacks) if (this.role(board[q]) === 'rook') b.add(q);
      if (attackerRole === 'elephant' || attackerRole === 'advisor')
        for (const q of attacks) if (['rook', 'cannon', 'horse'].includes(this.role(board[q])!)) b.add(q);
      // 排除互相攻擊（例外：蹩腳馬、牽制）
      const diagNeighborsOccupied = [[1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => {
        const x = (attackerSq % W) + dx, y = Math.floor(attackerSq / W) + dy;
        return x >= 0 && y >= 0 && x < W && y < this.e.H && !!board[y * W + x];
      });
      if (attackerRole === 'horse' && diagNeighborsOccupied) {
        for (const s of [...attacks]) {
          if (board[s]?.side === stm && this.role(board[s]) === 'horse' && this.attackSet(board, s, stm, board[s]!.type).has(attackerSq))
            attacks.delete(s);
        }
      } else {
        attacks = new Set([...attacks].filter(q => this.role(board[q]) !== attackerRole || pins.has(q)));
      }
      // 攻擊可能沒有根的棋子
      const occ = board.slice();
      occ[attackerSq] = null;
      for (const s of attacks) {
        const roots = [...this.attackersTo(occ, s, stm)].filter(q => !pins.has(q));
        const onlyKing = roots.length > 0 && roots.every(q => q === stmKing) && roots.length === 1;
        if (!roots.length || (flyingGeneral && onlyKing && themKing >= 0 && this.openFileFrom(occ, themKing).has(s))) b.add(s);
      }
    };

    // 直接攻擊
    const { from, to } = st.last;
    const moved = board[to];
    const movedRole = this.role(moved);
    if (moved && movedRole && movedRole !== 'king' && movedRole !== 'soldier') {
      let direct = new Set([...this.attackSet(board, to, them, moved.type)].filter(q => board[q]?.side === stm));
      if (movedRole === 'rook' || movedRole === 'cannon') {
        const line = this.lineThrough(from, to);
        direct = new Set([...direct].filter(q => !line.has(q)));
      }
      addChased(to, movedRole, direct);
    }

    // 閃擊（讓開線路後產生的新攻擊）
    const oldOcc = board.slice();
    if (!st.last.captured) oldOcc[to] = null;
    oldOcc[from] = { type: DUMMY, side: them };
    const cands: BB = new Set();
    const fx = from % W, fy = Math.floor(from / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = from + dx + dy * W;
      if (fx + dx >= 0 && fx + dx < W && fy + dy >= 0 && fy + dy < this.e.H && board[q]?.side === them && this.role(board[q]) === 'horse') cands.add(q);
    }
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const q = from + dx + dy * W;
      if (fx + dx >= 0 && fx + dx < W && fy + dy >= 0 && fy + dy < this.e.H && board[q]?.side === them && this.role(board[q]) === 'elephant') cands.add(q);
    }
    board.forEach((p, q) => {
      if (!p || p.side !== them) return;
      const r = this.role(p);
      const onLine = (a: Sq) => q !== a && (q % W === a % W || Math.floor(q / W) === Math.floor(a / W));
      if ((r === 'cannon' || r === 'rook') && onLine(from)) cands.add(q);
      if (r === 'cannon' && onLine(to)) cands.add(q);
    });
    for (const s of cands) {
      const p = board[s]!;
      const now = this.attackSet(board, s, them, p.type);
      const before = this.attackSet(oldOcc, s, them, p.type);
      const disc = new Set([...now].filter(q => board[q]?.side === stm && !before.has(q)));
      addChased(s, this.role(p)!, disc);
    }

    // 真假根的變化與閃將
    if (prev) {
      const [nowB, prevB] = [this.blockers(st)[stm], this.blockers(prev)[stm]];
      const newPins = [...nowB].filter(q => !prevB.has(q) && board[q]?.side === stm);
      const themBlockers = this.blockers(st)[them];
      for (const s of newPins) {
        const fake = [...this.attackSet(board, s, stm, board[s]!.type)]
          .filter(q => board[q]?.side === stm && !excluded.has(q));
        for (const s2 of fake) {
          if ([...this.attackersTo(board, s2, them)].some(q => !themBlockers.has(q))) b.add(s2);
        }
      }
      const newDiscoverers = [...nowB].filter(q => !prevB.has(q) && board[q]?.side === them);
      const kingAttacks = stmKing >= 0 ? this.attackSet(board, stmKing, stm, board[stmKing]!.type) : new Set<Sq>();
      for (const s of newDiscoverers) {
        const da = [...this.attackSet(board, s, them, board[s]!.type)].filter(q => board[q]?.side === stm);
        for (const q of da) if (!kingAttacks.has(q)) b.add(q);
        for (const s2 of da.filter(q => kingAttacks.has(q))) {
          const occ = board.slice();
          occ[s] = null;
          occ[stmKing] = null;
          if ([...this.attackersTo(occ, s2, them)].some(q => q !== s)) b.add(s2);
        }
      }
    }
    return b;
  }

  /** 從 sq 沿直線（車的走法）看出去，到第一個子為止經過與碰到的格子 */
  private openFileFrom(occ: (Piece | null)[], sq: Sq): BB {
    const W = this.e.W, H = this.e.H;
    const r: BB = new Set();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let x = (sq % W) + dx, y = Math.floor(sq / W) + dy;
      while (x >= 0 && y >= 0 && x < W && y < H) {
        r.add(y * W + x);
        if (occ[y * W + x]) break;
        x += dx; y += dy;
      }
    }
    return r;
  }

  /** line_bb(from, to)：通過兩點的整條直線 */
  private lineThrough(a: Sq, b: Sq): BB {
    const W = this.e.W, H = this.e.H;
    const r: BB = new Set();
    if (a % W === b % W) for (let y = 0; y < H; y++) r.add(y * W + (a % W));
    else if (Math.floor(a / W) === Math.floor(b / W)) for (let x = 0; x < W; x++) r.add(Math.floor(a / W) * W + x);
    return r;
  }

  private undoMoveBoard(b: BB, st: GameState): BB {
    const m = st.last;
    if (!m || m.from < 0 || !b.has(m.to)) return b;
    const r = new Set(b);
    r.delete(m.to);
    r.add(m.from);
    return r;
  }

  private and(a: BB, b: BB): BB {
    return new Set([...a].filter(q => b.has(q)));
  }

  /**
   * is_optional_game_end 的 n-fold 段落：第 nFold 次重複時，依長將、長捉判定勝負。
   * history 最後一項為目前局面。回傳 null 表示尚未達到重複次數。
   */
  repetitionResult(history: GameState[], nFold: number): Result | null {
    const n = history.length - 1;
    const P = (k: number) => history[k];
    const st = P(n);
    const end = Math.min(st.halfmoveClock, n);
    if (end < 4) return null;
    const inCheck = (k: number) => this.e.inCheck(P(k), P(k).turn);
    const chased = (k: number) => this.chased(P(k), k > 0 ? P(k - 1) : undefined);
    const key = this.e.hash(st);

    let cnt = 0;
    let perpetualThem = inCheck(n) && inCheck(n - 2);
    let perpetualUs = inCheck(n - 1) && inCheck(n - 3);
    let chaseThem = this.and(this.undoMoveBoard(chased(n), P(n - 1)), chased(n - 2));
    let chaseUs = this.and(this.undoMoveBoard(chased(n - 1), P(n - 2)), chased(n - 3));
    for (let i = 4; i <= end; i += 2) {
      if (i !== n) chaseThem = this.and(this.undoMoveBoard(chaseThem, P(n - i + 1)), chased(n - i));
      perpetualThem = perpetualThem && inCheck(n - i);
      if (this.e.hash(P(n - i)) === key && ++cnt + 1 >= nFold) {
        const stm = st.turn, them = (1 - stm) as Side;
        const name = (s: Side) => this.e.side(s);
        if (perpetualThem || perpetualUs) {
          if (perpetualThem && perpetualUs) return { kind: 'draw', reason: L('雙方長將（和棋）', 'Both sides perpetual check (draw)') };
          const loser = perpetualThem ? them : stm;
          return { kind: 'win', winner: (1 - loser) as Side, reason: L(`${name(loser).zh}長將判負`, `${name(loser).en} loses by perpetual check`) };
        }
        if (chaseThem.size || chaseUs.size) {
          if (chaseThem.size && chaseUs.size) return { kind: 'draw', reason: L('雙方長捉（和棋）', 'Both sides perpetual chase (draw)') };
          const loser = chaseThem.size ? them : stm;
          return { kind: 'win', winner: (1 - loser) as Side, reason: L(`${name(loser).zh}長捉判負`, `${name(loser).en} loses by perpetual chase`) };
        }
        return { kind: 'draw', reason: L(`同一局面出現 ${nFold} 次（和棋）`, `Position repeated ${nFold} times (draw)`) };
      }
      if (i + 1 <= end) {
        perpetualUs = perpetualUs && inCheck(n - i - 1);
        chaseUs = this.and(this.undoMoveBoard(chaseUs, P(n - i)), chased(n - i - 1));
      }
    }
    return null;
  }

  /** 50 回合規則的 AXF 調整：一方將軍超過 10 次的部分不計入 */
  moveRuleOffset(history: GameState[]): number {
    const n = history.length - 1;
    const st = history[n];
    if (n < 20) return 0;
    const end = Math.min(st.halfmoveClock, n);
    const inCheck = (k: number) => k >= 0 && this.e.inCheck(history[k], history[k].turn);
    let checkThem = +inCheck(n), checkUs = +inCheck(n - 1);
    for (let i = 2; i < end; i += 2) {
      checkThem += +inCheck(n - i);
      checkUs += +inCheck(n - i - 1);
    }
    return 2 * Math.max(Math.max(checkThem, checkUs) - 10, 0);
  }
}
