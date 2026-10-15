// 自由組合：棋盤 + 雙方（可混編的）軍隊 + 規則 → 一個可以下的變體
import type { BoardDef, PieceDef, Placement, RulesDef, Side, Text, VariantDef } from '../engine/types';
import { PRESETS } from '../variants/presets';

const L = (zh: string, en: string): Text => ({ zh, en });

/** 可選的棋盤：取自各棋種 */
export const BOARD_SOURCES = ['chess', 'xiangqi', 'janggi', 'shogi', 'makruk', 'sittuyin'];
/** 可當作底的軍隊：每個棋種的整套棋子與開局擺法 */
export const ARMY_SOURCES = PRESETS.map(v => v.id);

/** 棋子庫：所有棋種的棋子，記住來自哪個棋種 */
export const PIECE_LIBRARY: Record<string, { def: PieceDef; from: VariantDef }> = Object.fromEntries(
  PRESETS.flatMap(v => Object.values(v.pieces).map(p => [p.id, { def: p, from: v }])),
);

/** 一方的軍隊：以己方視角記錄位置（x 由左到右、rank 從己方底線算起） */
export interface MixArmy {
  base: string;
  pieces: { type: string; x: number; rank: number }[];
  hands: Record<string, number>;
}

export interface MixConfig {
  board: string;
  armies: [MixArmy, MixArmy];
  /** 後手使用與先手相同（上下鏡像）的軍隊 */
  mirror: boolean;
  rules: RulesDef;
}

const preset = (id: string) => PRESETS.find(v => v.id === id)!;
export const boardOf = (id: string) => preset(id).board;

/** 可以擺放的己方陣地：從底線算起的前幾排 */
export const campDepth = (board: BoardDef) => Math.floor(board.height / 2);

export const rankToY = (rank: number, side: Side, board: BoardDef) => (side === 0 ? rank : board.height - 1 - rank);
export const yToRank = (y: number, side: Side, board: BoardDef) => (side === 0 ? y : board.height - 1 - y);

/** 以某棋種一方的開局擺法作為軍隊（左右置中） */
export function armyFromBase(base: string, side: Side, board: BoardDef): MixArmy | { problem: Text } {
  const a = preset(base);
  const xOff = Math.floor((board.width - a.board.width) / 2);
  const pieces: MixArmy['pieces'] = [];
  for (const p of a.setup) {
    if (p.side !== side) continue;
    const rank = side === 0 ? p.y : a.board.height - 1 - p.y;
    const x = p.x + xOff;
    if (x < 0 || x >= board.width || rank >= Math.ceil(board.height / 2))
      return { problem: L(`棋盤太小，放不下${a.name}的軍隊`, `The board is too small for the ${a.nameEn ?? a.name} army`) };
    pieces.push({ type: p.type, x, rank });
  }
  const army: MixArmy = { base, pieces, hands: { ...a.initialHands } };
  const issue = palaceProblem(army, side, board);
  return issue ? { problem: issue } : army;
}

const confinedToPalace = (def: PieceDef) => def.moves.length > 0 && def.moves.every(r => r.confine === 'palace');
const usesPalace = (def: PieceDef) => def.moves.some(r => r.confine === 'palace' || r.when === 'palace' || r.palaceDiag);

function palaceProblem(army: MixArmy, side: Side, board: BoardDef): Text | null {
  const types = [...army.pieces.map(p => p.type), ...Object.keys(army.hands)];
  const defs = types.map(t => PIECE_LIBRARY[t]?.def).filter(Boolean) as PieceDef[];
  if (defs.some(usesPalace) && !board.palaces?.some(pl => pl.side === side))
    return L('有棋子只能在九宮裡走，但這個棋盤沒有九宮', 'Some pieces can only move inside a palace, but this board has none');
  return null;
}

/** 底軍隊的棋種用哪種方式鏡像：上下翻轉（西洋棋）或旋轉 180°（將棋、泰國象棋） */
export function mirrorMode(base: string): 'reflect' | 'rotate' {
  const v = preset(base);
  const H = v.board.height;
  const key = (x: number, y: number, t: string) => `${t}@${x},${y}`;
  const side1 = new Set(v.setup.filter(p => p.side === 1).map(p => key(p.x, p.y, p.type)));
  const reflect = v.setup.filter(p => p.side === 0).every(p => side1.has(key(p.x, H - 1 - p.y, p.type)));
  return reflect ? 'reflect' : 'rotate';
}

/** 實際使用的雙方軍隊（鏡像時後手照抄先手） */
export function effectiveArmies(cfg: MixConfig): [MixArmy, MixArmy] {
  if (!cfg.mirror) return cfg.armies;
  const a = cfg.armies[0];
  const W = boardOf(cfg.board).width;
  const rotate = mirrorMode(a.base) === 'rotate';
  return [a, { base: a.base, hands: { ...a.hands }, pieces: a.pieces.map(p => ({ ...p, x: rotate ? W - 1 - p.x : p.x })) }];
}

function sameAsBase(army: MixArmy, side: Side, board: BoardDef): boolean {
  const base = armyFromBase(army.base, side, board);
  if ('problem' in base) return false;
  const key = (a: MixArmy) => a.pieces.map(p => `${p.type}@${p.x},${p.rank}`).sort().join(' ') + JSON.stringify(a.hands);
  return key(base) === key(army);
}

/** 用到的棋子，加上它們升變、降級後的棋子 */
function collectPieces(types: string[]): Record<string, PieceDef> {
  const out: Record<string, PieceDef> = {};
  const queue = [...types];
  while (queue.length) {
    const id = queue.pop()!;
    if (out[id] || !PIECE_LIBRARY[id]) continue;
    const def = PIECE_LIBRARY[id].def;
    out[id] = def;
    queue.push(...(def.promotesTo ?? []));
    if (def.demotesTo) queue.push(def.demotesTo);
    if (def.sittuyin) queue.push(def.sittuyin.to);
  }
  return out;
}

export function buildMix(cfg: MixConfig): VariantDef | null {
  const bsrc = preset(cfg.board);
  const board = bsrc.board;
  const armies = effectiveArmies(cfg);
  const setup: Placement[] = [];
  const used = new Set<string>();
  for (const s of [0, 1] as Side[]) for (const p of armies[s].pieces) {
    const y = rankToY(p.rank, s, board);
    if (p.x < 0 || p.x >= board.width || y < 0 || y >= board.height) return null;
    const k = `${p.x},${y}`;
    if (used.has(k)) return null;
    used.add(k);
    setup.push({ type: p.type, side: s, x: p.x, y });
  }
  const types = [...setup.map(p => p.type), ...Object.keys(armies[0].hands), ...Object.keys(armies[1].hands)];
  const [b0, b1] = armies.map(a => preset(a.base));
  const edited = !sameAsBase(armies[0], 0, board) || !sameAsBase(armies[1], 1, board);
  const short = (a: VariantDef) => a.name.replace(/象棋$|將棋$|棋$/, '');
  const name = edited ? L('混編軍隊', 'Custom armies')
    : b0.id === b1.id ? L(`${b0.name}（${bsrc.name}棋盤）`, `${b0.nameEn} (on a ${bsrc.nameEn} board)`)
      : L(`${short(b0)}軍 對 ${short(b1)}軍`, `${b0.nameEn} vs ${b1.nameEn}`);
  return {
    id: 'mix-' + Date.now(),
    name: name.zh, nameEn: name.en,
    description: `自由組合：${bsrc.name}棋盤${edited ? '，混編軍隊' : `，${b0.name}軍隊對${b1.name}軍隊`}。`,
    descriptionEn: `Mix & match on a ${bsrc.nameEn} board${edited ? ' with custom armies' : `: ${b0.nameEn} army vs ${b1.nameEn} army`}.`,
    board: { ...board },
    pieces: collectPieces(types),
    setup,
    initialHandsBySide: [{ ...armies[0].hands }, { ...armies[1].hands }],
    rules: { ...cfg.rules },
    sideNames: [b0.sideNames[0], b1.sideNames[1]],
    sideNamesEn: [b0.sideNamesEn?.[0] ?? b0.sideNames[0], b1.sideNamesEn?.[1] ?? b1.sideNames[1]],
    sideColors: [b0.sideColors[0], b1.sideColors[1]],
    custom: true,
  };
}

/** 依目前的選擇給出提醒；errors 會阻止開局 */
export function checkMix(cfg: MixConfig): { errors: Text[]; warnings: Text[] } {
  const errors: Text[] = [], warnings: Text[] = [];
  const board = boardOf(cfg.board);
  const armies = effectiveArmies(cfg);
  const v = buildMix(cfg);
  if (!v) return { errors: [L('雙方棋子的位置重疊或超出棋盤', 'Pieces overlap or fall off the board')], warnings };
  const r = cfg.rules;
  for (const s of [0, 1] as Side[]) {
    const name = L(v.sideNames[s], v.sideNamesEn?.[s] ?? v.sideNames[s]);
    const types = [...armies[s].pieces.map(p => p.type), ...Object.keys(armies[s].hands)];
    const royals = types.filter(t => v.pieces[t]?.royal).length;
    if (!types.length) errors.push(L(`${name.zh}沒有任何棋子`, `${name.en} has no pieces`));
    else if (r.win !== 'captureAll' && royals === 0)
      errors.push(L(`${name.zh}沒有王，無法以將死或吃王分勝負`, `${name.en} has no king, so it cannot be mated or captured`));
    if (royals > 1)
      warnings.push(L(`${name.zh}有 ${royals} 個王：任何一個被攻擊都算被將軍`, `${name.en} has ${royals} kings: an attack on any of them counts as check`));
    const pp = palaceProblem(armies[s], s, board);
    if (pp) errors.push(pp);
    for (const p of armies[s].pieces) {
      const def = v.pieces[p.type];
      const y = rankToY(p.rank, s, board);
      const inPalace = board.palaces?.some(pl => pl.side === s && p.x >= pl.x && p.x < pl.x + pl.w && y >= pl.y && y < pl.y + pl.h);
      if (def && confinedToPalace(def) && !inPalace) {
        warnings.push(L(`${name.zh}的「${def.name}」放在九宮外，會完全不能動`, `${name.en}'s ${def.nameEn ?? def.name} is outside the palace and can never move`));
        break;
      }
    }
  }
  const pieces = Object.values(v.pieces);
  if (r.chasing === 'axf' && pieces.some(p => !p.xqRole))
    warnings.push(L('長捉判定只認得象棋的兵種；其他棋子不會被判為長捉', 'Perpetual-chase rulings only recognise xiangqi pieces; other pieces never count as chasing'));
  if (r.counting && !pieces.some(p => p.countAs))
    warnings.push(L('數步的上限依泰國象棋的棋子計算；這兩支軍隊沒有對應的棋子，數步只會用預設上限', 'Counting limits are defined by makruk pieces; these armies have none, so only default limits apply'));
  if (r.castling && !pieces.some(p => p.castlePartner))
    warnings.push(L('已開啟入堡，但雙方都沒有可以入堡的棋子', 'Castling is on, but neither army has a castling partner'));
  const anyHands = armies.some(a => Object.keys(a.hands).length);
  if (r.mustDrop && !anyHands)
    warnings.push(L('已開啟開局佈陣，但雙方開局手上都沒有棋子', 'The placement phase is on, but neither army starts with pieces in hand'));
  if (!r.drops && anyHands)
    errors.push(L('有軍隊要從手上佈陣，請開啟「打入」與「開局佈陣」', 'An army starts with pieces in hand: turn on drops and the placement phase'));
  return { errors, warnings };
}
