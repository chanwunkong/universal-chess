import type { MoveRule, PieceDef, Placement, Side, Vec, VariantDef } from '../engine/types';

// ---------- 方向向量 ----------
export const ORTH: Vec[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIAG: Vec[] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
export const ALL8: Vec[] = [...ORTH, ...DIAG];
export const KNIGHT: Vec[] = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [-2, 1], [2, -1], [-2, -1]];
const ELEPHANT_XQ: Vec[] = [[2, 2], [-2, 2], [2, -2], [-2, -2]];
const ELEPHANT_JG: Vec[] = [[2, 3], [-2, 3], [2, -3], [-2, -3], [3, 2], [-3, 2], [3, -2], [-3, -2]];

const r = (vectors: Vec[], range: number, extra: Partial<MoveRule> = {}): MoveRule =>
  ({ vectors, range, mode: 'both', ...extra });
const step = (v: Vec[], extra: Partial<MoveRule> = {}) => r(v, 1, extra);
const slide = (v: Vec[], extra: Partial<MoveRule> = {}) => r(v, 0, extra);

function piece(id: string, name: string, labels: [string, string] | string, style: PieceDef['style'],
  moves: MoveRule[], extra: Partial<PieceDef> = {}): PieceDef {
  return { id, name, labels: typeof labels === 'string' ? [labels, labels] : labels, style, moves, ...extra };
}

/** 依先手一方的擺法產生雙方配置；mirror = reflect（上下鏡像）或 rotate（180° 旋轉） */
export function mirrorSetup(rows: Record<number, (string | null)[]>, W: number, H: number,
  mode: 'reflect' | 'rotate' = 'reflect'): Placement[] {
  const out: Placement[] = [];
  for (const y in rows) rows[y].forEach((type, x) => {
    if (!type) return;
    const yy = Number(y);
    out.push({ type, side: 0, x, y: yy });
    out.push({ type, side: 1 as Side, x: mode === 'rotate' ? W - 1 - x : x, y: H - 1 - yy });
  });
  return out;
}

// ---------- 西洋棋 ----------
const chessPieces: Record<string, PieceDef> = {
  'c.k': piece('c.k', '國王', '♚', 'glyph', [step(ALL8)], { royal: true }),
  'c.q': piece('c.q', '皇后', '♛', 'glyph', [slide(ALL8)], { value: 9 }),
  'c.r': piece('c.r', '城堡', '♜', 'glyph', [slide(ORTH)], { value: 5, castlePartner: true }),
  'c.b': piece('c.b', '主教', '♝', 'glyph', [slide(DIAG)], { value: 3.2, minor: 'bishop' }),
  'c.n': piece('c.n', '騎士', '♞', 'glyph', [step(KNIGHT)], { value: 3, minor: 'knight' }),
  'c.p': piece('c.p', '士兵', '♟', 'glyph', [
    step([[0, 1]], { mode: 'move' }),
    step([[0, 2]], { mode: 'move', lame: true, initial: true }),
    step([[1, 1], [-1, 1]], { mode: 'capture' }),
  ], { value: 1, pawn: true, enPassant: true, promotesTo: ['c.q', 'c.r', 'c.b', 'c.n'], promoForced: true }),
};
const BACK = ['c.r', 'c.n', 'c.b', 'c.q', 'c.k', 'c.b', 'c.n', 'c.r'];

const chess: VariantDef = {
  id: 'chess', name: '西洋棋', description: '國際象棋，依 FIDE 棋規：入堡、吃過路兵、兵升變；三次重複與 50 回合可要求和棋，五次重複、75 回合與子力不足自動和棋。',
  board: { width: 8, height: 8, cell: 'square', checkered: true },
  pieces: chessPieces,
  setup: mirrorSetup({ 0: BACK, 1: Array(8).fill('c.p') }, 8, 8),
  // FIDE 棋規：三次重複、50 回合可要求和棋（9.2、9.3）；五次重複、75 回合自動和棋（9.6）；死局和棋（5.2.2）
  rules: {
    win: 'checkmate', stalemate: 'draw', promotionZone: 1, castling: true,
    repetition: 5, moveLimit: 150, repetitionClaim: 3, moveLimitClaim: 100, deadPosition: true,
  },
  sideNames: ['白方', '黑方'], sideColors: ['#f4f1e8', '#2b2b2b'],
};

// ---------- 中國象棋 / 越南象棋 ----------
function xiangqiPieces(prefix: string, L: Record<string, [string, string]>): Record<string, PieceDef> {
  const p = (k: string) => prefix + k;
  return {
    [p('k')]: piece(p('k'), L.k[0] + '/' + L.k[1], L.k, 'disc', [step(ORTH, { confine: 'palace' })], { royal: true, xqRole: 'king' }),
    [p('a')]: piece(p('a'), L.a[0] + '/' + L.a[1], L.a, 'disc', [step(DIAG, { confine: 'palace' })], { value: 2, xqRole: 'advisor' }),
    [p('e')]: piece(p('e'), L.e[0] + '/' + L.e[1], L.e, 'disc', [step(ELEPHANT_XQ, { lame: true, confine: 'ownHalf' })], { value: 2, xqRole: 'elephant' }),
    [p('h')]: piece(p('h'), L.h[0] + '/' + L.h[1], L.h, 'disc', [step(KNIGHT, { lame: true })], { value: 4, xqRole: 'horse' }),
    [p('r')]: piece(p('r'), L.r[0] + '/' + L.r[1], L.r, 'disc', [slide(ORTH)], { value: 9, xqRole: 'rook' }),
    [p('c')]: piece(p('c'), L.c[0] + '/' + L.c[1], L.c, 'disc', [slide(ORTH, { hop: 'cannon' })], { value: 4.5, xqRole: 'cannon' }),
    [p('p')]: piece(p('p'), L.p[0] + '/' + L.p[1], L.p, 'disc', [
      step([[0, 1]]),
      step([[1, 0], [-1, 0]], { when: 'enemyHalf' }),
    ], { value: 1, xqRole: 'soldier' }),
  };
}
const XQ_PALACES = [{ x: 3, y: 0, w: 3, h: 3, side: 0 as Side }, { x: 3, y: 7, w: 3, h: 3, side: 1 as Side }];
function xiangqiSetup(pf: string) {
  const k = (s: string) => pf + s;
  return mirrorSetup({
    0: ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r'].map(k),
    2: [null, k('c'), null, null, null, null, null, k('c'), null],
    3: [k('p'), null, k('p'), null, k('p'), null, k('p'), null, k('p')],
  }, 9, 10);
}
// 亞洲象棋聯合會（AXF）規則，依 Fairy-Stockfish xiangqi_variant 實作：困斃判負、王不見王、
// 長將與長捉於第三次重複時判負、其餘重複和棋、50 回合無吃子和棋（一方將軍超過 10 次的部分不計）
const XQ_RULES = { win: 'checkmate', stalemate: 'loss', promotionZone: 0, flyingGeneral: true, chasing: 'axf', repetition: 3, moveLimit: 100 } as const;

const xiangqi: VariantDef = {
  id: 'xiangqi', name: '中國象棋', description: '楚河漢界、九宮、蹩馬腿、塞象眼、炮隔子吃、將帥不能照面。依亞洲象棋聯合會規則：長將、長捉判負，困斃判負。',
  board: { width: 9, height: 10, cell: 'intersection', river: true, palaces: XQ_PALACES },
  pieces: xiangqiPieces('x.', {
    k: ['帥', '將'], a: ['仕', '士'], e: ['相', '象'], h: ['傌', '馬'], r: ['俥', '車'], c: ['炮', '砲'], p: ['兵', '卒'],
  }),
  setup: xiangqiSetup('x.'),
  rules: { ...XQ_RULES },
  sideNames: ['紅方', '黑方'], sideColors: ['#c0392b', '#222222'],
};

const vietnamese: VariantDef = {
  id: 'cotuong', name: '越南象棋', description: 'Cờ tướng：走法與中國象棋相同，使用越南語棋子名稱。越南象棋聯合會的條文未規定重複幾次才裁決，因此長將、長捉暫依亞洲象棋聯合會（AXF）規則裁決。',
  board: { width: 9, height: 10, cell: 'intersection', river: true, palaces: XQ_PALACES },
  pieces: xiangqiPieces('v.', {
    k: ['Tướng', 'Tướng'], a: ['Sĩ', 'Sĩ'], e: ['Tượng', 'Tượng'], h: ['Mã', 'Mã'], r: ['Xe', 'Xe'], c: ['Pháo', 'Pháo'], p: ['Tốt', 'Tốt'],
  }),
  setup: xiangqiSetup('v.'),
  rules: { ...XQ_RULES },
  sideNames: ['紅方', '黑方'], sideColors: ['#c0392b', '#222222'],
};

// ---------- 日本將棋 ----------
const GOLD: Vec[] = [...ORTH, [1, 1], [-1, 1]];
const goldMove = [step(GOLD)];
const shogiPieces: Record<string, PieceDef> = {
  's.k': piece('s.k', '玉將/王將', ['玉', '王'], 'shogi', [step(ALL8)], { royal: true }),
  's.r': piece('s.r', '飛車', '飛', 'shogi', [slide(ORTH)], { value: 10, promotesTo: ['s.+r'], points: 5 }),
  's.b': piece('s.b', '角行', '角', 'shogi', [slide(DIAG)], { value: 8, promotesTo: ['s.+b'], points: 5 }),
  's.g': piece('s.g', '金將', '金', 'shogi', goldMove, { value: 6 }),
  's.s': piece('s.s', '銀將', '銀', 'shogi', [step([...DIAG, [0, 1]])], { value: 5, promotesTo: ['s.+s'] }),
  's.n': piece('s.n', '桂馬', '桂', 'shogi', [step([[1, 2], [-1, 2]])], { value: 4, promotesTo: ['s.+n'], mustPromoteDepth: 2 }),
  's.l': piece('s.l', '香車', '香', 'shogi', [slide([[0, 1]])], { value: 3, promotesTo: ['s.+l'], mustPromoteDepth: 1 }),
  's.p': piece('s.p', '步兵', '歩', 'shogi', [step([[0, 1]])], {
    value: 1, promotesTo: ['s.+p'], mustPromoteDepth: 1, nifu: true, noDropMate: true,
  }),
  's.+r': piece('s.+r', '龍王', '龍', 'shogi', [slide(ORTH), step(DIAG)], { value: 12, demotesTo: 's.r', points: 5 }),
  's.+b': piece('s.+b', '龍馬', '馬', 'shogi', [slide(DIAG), step(ORTH)], { value: 10, demotesTo: 's.b', points: 5 }),
  's.+s': piece('s.+s', '成銀', '全', 'shogi', goldMove, { value: 6, demotesTo: 's.s' }),
  's.+n': piece('s.+n', '成桂', '圭', 'shogi', goldMove, { value: 6, demotesTo: 's.n' }),
  's.+l': piece('s.+l', '成香', '杏', 'shogi', goldMove, { value: 6, demotesTo: 's.l' }),
  's.+p': piece('s.+p', 'と金', 'と', 'shogi', goldMove, { value: 6, demotesTo: 's.p' }),
};
const shogi: VariantDef = {
  id: 'shogi', name: '日本將棋', description: '吃掉的棋子可以打入，敵陣三排可升變。依日本將棋聯盟規則：二步、打步詰、千日手、連續王手千日手、持將棋與入玉宣言。',
  board: { width: 9, height: 9, cell: 'square' },
  pieces: shogiPieces,
  setup: mirrorSetup({
    0: ['s.l', 's.n', 's.s', 's.g', 's.k', 's.g', 's.s', 's.n', 's.l'],
    1: [null, 's.b', null, null, null, null, null, 's.r', null],
    2: Array(9).fill('s.p'),
  }, 9, 9, 'rotate'),
  // 日本將棋聯盟「対局規則」：千日手（同一局面 4 次）、連續王手千日手將軍方負、持將棋（24 點／入玉宣言 31 點／500 手）
  rules: {
    win: 'checkmate', stalemate: 'loss', promotionZone: 3, drops: true,
    repetition: 4, moveLimit: 0, perpetualCheckLoses: true, maxPlies: 500, impasse: 'jsa',
  },
  sideNames: ['先手', '後手'], sideColors: ['#f3d9a4', '#f3d9a4'],
};

// ---------- 韓國象棋 ----------
const janggiPieces: Record<string, PieceDef> = {
  'j.k': piece('j.k', '將', ['楚', '漢'], 'octagon', [step(ORTH, { confine: 'palace' }), step(DIAG, { confine: 'palace', palaceDiag: true })], { royal: true }),
  'j.a': piece('j.a', '士', '士', 'octagon', [step(ORTH, { confine: 'palace' }), step(DIAG, { confine: 'palace', palaceDiag: true })], { value: 3, points: 3 }),
  'j.e': piece('j.e', '象', '象', 'octagon', [step(ELEPHANT_JG, { lame: true })], { value: 3, points: 3 }),
  'j.h': piece('j.h', '馬', '馬', 'octagon', [step(KNIGHT, { lame: true })], { value: 5, points: 5 }),
  'j.r': piece('j.r', '車', '車', 'octagon', [slide(ORTH), slide(DIAG, { palaceDiag: true })], { value: 13, points: 13 }),
  'j.c': piece('j.c', '包', '包', 'octagon', [slide(ORTH, { hop: 'janggi' }), slide(DIAG, { hop: 'janggi', palaceDiag: true })], { value: 7, points: 7 }),
  'j.p': piece('j.p', '卒/兵', ['卒', '兵'], 'octagon', [step([[0, 1], [1, 0], [-1, 0]]), step([[1, 1], [-1, 1]], { palaceDiag: true })], { value: 2, points: 2 }),
};
/** 韓國象棋底線 b、c、g、h 四個位置的馬象擺法 */
function janggiRow(types: string[]) {
  return [1, 2, 6, 7].map((x, i) => ({ x, y: 0, type: types[i] }));
}
const janggi: VariantDef = {
  id: 'janggi', name: '韓國象棋', description: '장기（正式比賽規則）：開局由漢、楚依序選擇馬象擺法，楚先走；九宮內可走斜線，包須隔子且不能跳過或吃包；可以停著；照面（빅장）後停著、重複局面、50 回合無吃子、雙方連續停著皆以計分判定（漢加 1.5 分）；連續將軍造成重複則將軍方負。',
  board: { width: 9, height: 10, cell: 'intersection', palaces: XQ_PALACES },
  pieces: janggiPieces,
  setup: mirrorSetup({
    0: ['j.r', 'j.h', 'j.e', 'j.a', null, 'j.a', 'j.e', 'j.h', 'j.r'],
    1: [null, null, null, null, 'j.k', null, null, null, null],
    2: [null, 'j.c', null, null, null, null, null, 'j.c', null],
    3: ['j.p', null, 'j.p', null, 'j.p', null, 'j.p', null, 'j.p'],
  }, 9, 10),
  // 規則依據：PyChess 韓國象棋說明與 Fairy-Stockfish janggi_variant（正式比賽規則）
  setupChoice: {
    order: [1, 0], // 漢方先選，楚方後選
    options: [
      { name: '內象（마상상마）', placements: janggiRow(['j.h', 'j.e', 'j.e', 'j.h']) },
      { name: '外象（상마마상）', placements: janggiRow(['j.e', 'j.h', 'j.h', 'j.e']) },
      { name: '左內右外（마상마상）', placements: janggiRow(['j.h', 'j.e', 'j.h', 'j.e']) },
      { name: '左外右內（상마상마）', placements: janggiRow(['j.e', 'j.h', 'j.e', 'j.h']) },
    ],
  },
  rules: {
    win: 'checkmate', stalemate: 'loss', promotionZone: 0, allowPass: true, bikjang: true,
    repetition: 3, perpetualCheckLoses: true, moveLimit: 100, pointsAdjudication: { bonus: [0, 1.5] },
  },
  sideNames: ['楚（藍）', '漢（紅）'], sideColors: ['#1f5fa8', '#c0392b'],
};

// ---------- 蒙古象棋 Shatar ----------
const shatarPieces: Record<string, PieceDef> = {
  'm.k': piece('m.k', 'Noyon 諾顏', '♚', 'glyph', [step(ALL8)], { royal: true }),
  'm.q': piece('m.q', 'Bers', '♛', 'glyph', [slide(ORTH), step(DIAG)], { value: 6 }),
  'm.b': piece('m.b', 'Temee 駱駝', '♝', 'glyph', [slide(DIAG)], { value: 3.2 }),
  'm.n': piece('m.n', 'Mori 馬', '♞', 'glyph', [step(KNIGHT)], { value: 3 }),
  'm.r': piece('m.r', 'Tereg 車', '♜', 'glyph', [slide(ORTH)], { value: 5 }),
  'm.p': piece('m.p', 'Khuu 兒', '♟', 'glyph', [
    step([[0, 1]], { mode: 'move' }),
    step([[1, 1], [-1, 1]], { mode: 'capture' }),
  ], { value: 1, pawn: true, promotesTo: ['m.q'], promoForced: true }),
};
const shatar: VariantDef = {
  id: 'shatar', name: '蒙古象棋', description: 'Shatar（傳統規則）：開局雙方 d 兵已對頂；Bers 走直線或斜一格；兵只走一格，升變為 Bers；沒有入堡；不能只用馬將死，將死前的連續將軍至少要有一次由車、馬或 Bers 將軍，否則和棋（Niol）；只剩王為和棋（Robado）。',
  board: { width: 8, height: 8, cell: 'square', checkered: true },
  pieces: shatarPieces,
  // 規則依據：Wikipedia「Shatar」與 Fairy-Stockfish shatar_variant（PyChess 採用的傳統規則）
  setup: mirrorSetup({
    0: ['m.r', 'm.n', 'm.b', 'm.q', 'm.k', 'm.b', 'm.n', 'm.r'],
    1: ['m.p', 'm.p', 'm.p', null, 'm.p', 'm.p', 'm.p', 'm.p'],
    3: [null, null, null, 'm.p', null, null, null, null],
  }, 8, 8),
  rules: {
    win: 'checkmate', stalemate: 'draw', promotionZone: 1, noMateBy: ['m.n'], mateRequiresCheckBy: ['m.n', 'm.r', 'm.q'],
    bareKingDraw: true, repetition: 3, moveLimit: 100,
  },
  sideNames: ['白方', '黑方'], sideColors: ['#f4f1e8', '#7a3b1d'],
};

// ---------- 泰國象棋 Makruk / 柬埔寨象棋 Ouk Chatrang ----------
const SILVER: Vec[] = [...DIAG, [0, 1]];
function makrukPieces(prefix: string, names: Record<string, string>, cambodian = false): Record<string, PieceDef> {
  const p = (k: string) => prefix + k;
  return {
    [p('k')]: piece(p('k'), names.k, '♚', 'glyph', [
      step(ALL8),
      // 王第一步可走馬步到前一排；不能吃子、被將軍時不能用；敵車一旦走到王的橫排或直線上即永久失效
      ...(cambodian ? [step([[2, 1], [-2, 1]], { mode: 'move' as const, initial: true, notInCheck: true, lostIfEnemyOnLine: [p('r')] })] : []),
    ], { royal: true }),
    [p('m')]: piece(p('m'), names.m, '♛', 'glyph', [
      step(DIAG),
      ...(cambodian ? [step([[0, 2]], { mode: 'move' as const, initial: true })] : []),
    ], { value: 1.8, countAs: 'queen' }),
    [p('s')]: piece(p('s'), names.s, '♝', 'glyph', [step(SILVER)], { value: 2.5, countAs: 'bishop' }),
    [p('n')]: piece(p('n'), names.n, '♞', 'glyph', [step(KNIGHT)], { value: 3, countAs: 'knight' }),
    [p('r')]: piece(p('r'), names.r, '♜', 'glyph', [slide(ORTH)], { value: 5, countAs: 'rook' }),
    [p('p')]: piece(p('p'), names.p, '♟', 'glyph', [
      step([[0, 1]], { mode: 'move' }),
      step([[1, 1], [-1, 1]], { mode: 'capture' }),
    ], { value: 1, pawn: true, promotesTo: [p('m')], promoForced: true }),
  };
}
const makrukSetup = (pf: string) => mirrorSetup({
  0: ['r', 'n', 's', 'k', 'm', 's', 'n', 'r'].map(k => pf + k),
  2: Array(8).fill(pf + 'p'),
}, 8, 8, 'rotate');
// 規則依據：PyChess 規則說明與 Fairy-Stockfish（makruk_variant / cambodian_variant）
const MAKRUK_RULES = { win: 'checkmate', stalemate: 'draw', promotionZone: 3, repetition: 3, moveLimit: 0 } as const;

const makruk: VariantDef = {
  id: 'makruk', name: '泰國象棋', description: 'Makruk：兵排在第三排，走到第六排升變為 Met；Met 只能斜走一格，Khon 走法如將棋銀將。',
  board: { width: 8, height: 8, cell: 'square' },
  pieces: makrukPieces('t.', { k: 'Khun 王', m: 'Met 謀士', s: 'Khon 貴族', n: 'Ma 馬', r: 'Rua 船', p: 'Bia 貝' }),
  setup: makrukSetup('t.'),
  rules: { ...MAKRUK_RULES, counting: 'makruk' },
  sideNames: ['白方', '黑方'], sideColors: ['#f4f1e8', '#2b2b2b'],
};

const ouk: VariantDef = {
  id: 'ouk', name: '柬埔寨象棋', description: 'Ouk Chatrang：和泰國象棋相近。王第一步可跳馬步到前一排（被將軍時不行，敵車走到王的直線或橫排後永久失效）；Neang 第一步可直跳兩格。',
  board: { width: 8, height: 8, cell: 'square' },
  pieces: makrukPieces('o.', { k: 'Ang 王', m: 'Neang 王后', s: 'Kol 柱', n: 'Seh 馬', r: 'Tuk 船', p: 'Trey 魚' }, true),
  setup: makrukSetup('o.'),
  rules: { ...MAKRUK_RULES, counting: 'cambodian' },
  sideNames: ['白方', '黑方'], sideColors: ['#f4f1e8', '#8a1f1f'],
};

// ---------- 波斯／阿拉伯象棋 Shatranj ----------
const shatranjPieces: Record<string, PieceDef> = {
  'p.k': piece('p.k', 'Shah 王', '♚', 'glyph', [step(ALL8)], { royal: true }),
  'p.f': piece('p.f', 'Ferz 宰相', '♛', 'glyph', [step(DIAG)], { value: 1.6 }),
  'p.a': piece('p.a', 'Alfil 象', '♝', 'glyph', [step([[2, 2], [-2, 2], [2, -2], [-2, -2]])], { value: 1.3 }),
  'p.n': piece('p.n', 'Faras 馬', '♞', 'glyph', [step(KNIGHT)], { value: 3 }),
  'p.r': piece('p.r', 'Rukh 車', '♜', 'glyph', [slide(ORTH)], { value: 5 }),
  'p.p': piece('p.p', 'Baidaq 兵', '♟', 'glyph', [
    step([[0, 1]], { mode: 'move' }),
    step([[1, 1], [-1, 1]], { mode: 'capture' }),
  ], { value: 1, pawn: true, promotesTo: ['p.f'], promoForced: true }),
};
const shatranj: VariantDef = {
  id: 'shatranj', name: '波斯象棋', description: 'Shatranj：西洋棋的祖先。宰相只能斜走一格，象斜跳兩格（可越子）。困斃對方即勝；吃到對方只剩王即勝，但對方若能立刻也把你吃到只剩王則和棋。',
  board: { width: 8, height: 8, cell: 'square', checkered: true },
  pieces: shatranjPieces,
  // 王的左右位置在歷史上並不固定（Wikipedia），此處採用與 PyChess／Fairy-Stockfish 相同的擺法：王在 d 列、雙王同列相對
  setup: mirrorSetup({ 0: ['p.r', 'p.n', 'p.a', 'p.k', 'p.f', 'p.a', 'p.n', 'p.r'], 1: Array(8).fill('p.p') }, 8, 8),
  // 規則依據：Wikipedia「Shatranj」與 Fairy-Stockfish shatranj_variant
  rules: { win: 'checkmate', stalemate: 'loss', promotionZone: 1, bareKing: true, repetition: 3, moveLimit: 0 },
  sideNames: ['白方', '黑方'], sideColors: ['#f4f1e8', '#1f4f3a'],
};

export const PRESETS: VariantDef[] = [chess, xiangqi, vietnamese, shogi, janggi, shatar, makruk, ouk, shatranj];

/** 所有預設棋子組成的棋子庫（供自訂模式挑選） */
export function pieceLibrary(): { group: string; pieces: PieceDef[] }[] {
  return PRESETS.map(v => ({ group: v.name, pieces: Object.values(v.pieces) }));
}
