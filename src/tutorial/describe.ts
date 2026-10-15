// 由棋子的走法資料自動產生雙語說明（不手寫規則文字，避免與引擎不一致）。
import type { MoveRule, PieceDef, Text, Vec, VariantDef } from '../engine/types';

const L = (zh: string, en: string): Text => ({ zh, en });
const key = (vs: Vec[]) => vs.map(v => v.join(',')).sort().join(' ');
const sameSet = (a: Vec[], b: Vec[]) => key(a) === key(b);

const ORTH: Vec[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: Vec[] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const KNIGHT: Vec[] = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [-2, 1], [2, -1], [-2, -1]];
const XQ_ELEPHANT: Vec[] = [[2, 2], [-2, 2], [2, -2], [-2, -2]];
const JG_ELEPHANT: Vec[] = [[2, 3], [-2, 3], [2, -3], [-2, -3], [3, 2], [-3, 2], [3, -2], [-3, -2]];

/** 單一方向的名稱 */
function dirName([x, y]: Vec): Text {
  if (x === 0 && y > 0) return L('前', 'forward');
  if (x === 0 && y < 0) return L('後', 'backward');
  if (y === 0) return L('橫', 'sideways');
  if (Math.abs(x) === Math.abs(y)) return y > 0 ? L('斜前', 'diagonally forward') : L('斜後', 'diagonally backward');
  return L(`跳 (${x},${y})`, `leap (${x},${y})`);
}

/** 一組方向的名稱 */
function vectorsName(vs: Vec[]): Text {
  if (sameSet(vs, [...ORTH, ...DIAG])) return L('八個方向', 'in any of the 8 directions');
  if (sameSet(vs, ORTH)) return L('直線（前後左右）', 'orthogonally');
  if (sameSet(vs, DIAG)) return L('斜線', 'diagonally');
  if (sameSet(vs, KNIGHT)) return L('「日」字（馬步）', 'in an L-shape (like a knight)');
  if (sameSet(vs, XQ_ELEPHANT)) return L('「田」字，也就是斜走兩格', 'two squares diagonally');
  if (sameSet(vs, JG_ELEPHANT)) return L('「用」字，也就是直走一格再斜走兩格', 'one step straight then two diagonally');
  if (vs.every(v => KNIGHT.some(k => k[0] === v[0] && k[1] === v[1]))) {
    if (vs.every(v => v[1] > 0)) return L('往前方的「日」字（只能往前跳）', 'in a forward-only L-shape');
    return L('部分方向的「日」字', 'in some L-shaped directions');
  }
  // 依方向名稱去重後列出
  const names: Text[] = [];
  for (const v of vs) {
    const n = dirName(v);
    if (!names.some(m => m.zh === n.zh)) names.push(n);
  }
  return L(names.map(n => n.zh).join('、'), names.map(n => n.en).join(', '));
}

function regionName(r: MoveRule['confine']): Text {
  switch (r) {
    case 'palace': return L('九宮', 'the palace');
    case 'ownHalf': return L('己方半場（不能過河）', 'its own half (cannot cross the river)');
    case 'enemyHalf': return L('敵方半場（過河後）', 'the enemy half (after crossing the river)');
    case 'promoZone': return L('升變區', 'the promotion zone');
    default: return L('', '');
  }
}

export function describeRule(r: MoveRule): Text {
  const dirs = vectorsName(r.vectors);
  const shaped = [XQ_ELEPHANT, JG_ELEPHANT].some(set => sameSet(r.vectors, set)) ||
    r.vectors.every(v => KNIGHT.some(k => k[0] === v[0] && k[1] === v[1]));
  const lens = new Set(r.vectors.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
  const straight = r.vectors.every(([x, y]) => x === 0 || y === 0 || Math.abs(x) === Math.abs(y));
  const dist = lens.size === 1 ? [...lens][0] : 1;
  let zh: string, en: string;
  if (r.hop === 'cannon') {
    zh = `沿${dirs.zh}移動任意格；吃子時必須隔著正好一枚棋子（炮架）`;
    en = `moves any distance ${dirs.en}; to capture it must jump over exactly one piece (a screen)`;
  } else if (r.hop === 'janggi') {
    zh = `沿${dirs.zh}移動或吃子時都必須跳過正好一枚棋子，而且不能跳過或吃掉包`;
    en = `must jump over exactly one piece ${dirs.en} both to move and to capture, and may not jump over or capture a cannon`;
  } else if (r.range === 0) {
    zh = `沿${dirs.zh}走任意格數`; en = `moves any distance ${dirs.en}`;
  } else if (r.range > 1) {
    zh = `沿${dirs.zh}最多走 ${r.range} 格`; en = `moves up to ${r.range} squares ${dirs.en}`;
  } else if (shaped) {
    zh = `走${dirs.zh}`; en = `moves ${dirs.en}`;
  } else if (straight && dist > 1) {
    zh = `往${dirs.zh}走 ${dist} 格`; en = `moves ${dist} squares ${dirs.en}`;
  } else if (!straight) {
    zh = `跳到 ${dirs.zh}`; en = `leaps to ${dirs.en}`;
  } else {
    zh = `往${dirs.zh}走一步`; en = `steps once ${dirs.en}`;
  }
  const extra: Text[] = [];
  if (r.mode === 'move') extra.push(L('只能移動、不能吃子', 'move only, no capture'));
  if (r.mode === 'capture') extra.push(L('只能用來吃子', 'captures only'));
  if (r.lame) extra.push(L('途中有棋子擋住就不能走，稱為「蹩腳」', 'it is blocked if a piece stands in the way'));
  if (r.initial) extra.push(L('只限這枚棋子的第一步', 'only on this piece’s first move'));
  if (r.notInCheck) extra.push(L('被將軍時不能使用', 'not while in check'));
  if (r.when) extra.push(L(`只有在${regionName(r.when).zh}時才可以`, `only while in ${regionName(r.when).en}`));
  if (r.confine) extra.push(L(`不能離開${regionName(r.confine).zh}`, `cannot leave ${regionName(r.confine).en}`));
  if (r.palaceDiag) extra.push(L('斜走只能沿九宮斜線', 'diagonals only along the palace lines'));
  if (extra.length) {
    zh += `；${extra.map(e => e.zh).join('；')}`;
    en += `; ${extra.map(e => e.en).join('; ')}`;
  }
  return L(zh, en);
}

/** 整枚棋子的說明：每條走法一行，加上王、升變等性質 */
export function describePiece(def: PieceDef, v: VariantDef): Text[] {
  const name = (id: string) => L(v.pieces[id]?.name ?? id, v.pieces[id]?.nameEn ?? v.pieces[id]?.name ?? id);
  const lines = def.moves.map(describeRule);
  if (def.royal) lines.unshift(L('王：被將死就輸了', 'Royal: if it is checkmated, you lose'));
  if (def.promotesTo?.length) {
    const ns = def.promotesTo.map(name);
    lines.push(L(`可以升變為 ${ns.map(n => n.zh).join('、')}`, `can promote to ${ns.map(n => n.en).join(', ')}`));
  }
  if (def.sittuyin) lines.push(L(`走到對方的對角線後，可在原地或斜一格升變為 ${name(def.sittuyin.to).zh}`, `on the opponent’s diagonal it may promote to ${name(def.sittuyin.to).en} in place or one step diagonally`));
  if (def.demotesTo) lines.push(L(`被吃掉後會變回 ${name(def.demotesTo).zh}`, `reverts to ${name(def.demotesTo).en} when captured`));
  if (def.castlePartner) lines.push(L('可以和王入堡', 'can castle with the king'));
  return lines;
}
