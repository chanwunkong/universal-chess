// 自由組合：棋盤 + 雙方軍隊 + 規則 → 一個可以下的變體
import type { BoardDef, PieceDef, Placement, RulesDef, Side, Text, VariantDef } from '../engine/types';
import { PRESETS } from '../variants/presets';

const L = (zh: string, en: string): Text => ({ zh, en });

/** 可選的棋盤：取自各棋種 */
export const BOARD_SOURCES = ['chess', 'xiangqi', 'janggi', 'shogi', 'makruk', 'sittuyin'];
/** 可選的軍隊：每個棋種的整套棋子與開局擺法 */
export const ARMY_SOURCES = PRESETS.map(v => v.id);

export interface MixConfig {
  board: string;
  armies: [string, string];
  rules: RulesDef;
}

const preset = (id: string) => PRESETS.find(v => v.id === id)!;

function needsPalace(pieces: PieceDef[]): boolean {
  return pieces.some(p => p.moves.some(r => r.confine === 'palace' || r.when === 'palace' || r.palaceDiag));
}

/** 把某棋種一方的開局擺法放到另一個棋盤上（左右置中，從己方底線算起） */
export function placeArmy(armyId: string, side: Side, board: BoardDef): { placements: Placement[]; problem?: Text } {
  const a = preset(armyId);
  const W = a.board.width, H = a.board.height;
  const xOff = Math.floor((board.width - W) / 2);
  const placements: Placement[] = [];
  for (const p of a.setup) {
    if (p.side !== side) continue;
    const rank = side === 0 ? p.y : H - 1 - p.y;
    const x = p.x + xOff;
    const y = side === 0 ? rank : board.height - 1 - rank;
    if (x < 0 || x >= board.width || rank >= Math.ceil(board.height / 2))
      return { placements: [], problem: L(`棋盤太小，放不下${a.name}的軍隊`, `The board is too small for the ${a.nameEn ?? a.name} army`) };
    placements.push({ ...p, side, x, y });
  }
  const sidePieces = [...new Set(placements.map(p => p.type)), ...Object.keys(a.initialHands ?? {})].map(t => a.pieces[t]);
  if (needsPalace(sidePieces) && !board.palaces?.some(pl => pl.side === side))
    return { placements: [], problem: L(`${a.name}的將帥與士只能在九宮裡走，這個棋盤沒有九宮`, `The ${a.nameEn ?? a.name} army needs a palace, but this board has none`) };
  return { placements };
}

/** 依目前的選擇給出提醒；errors 會阻止開局 */
export function checkMix(cfg: MixConfig): { errors: Text[]; warnings: Text[] } {
  const errors: Text[] = [], warnings: Text[] = [];
  const board = preset(cfg.board).board;
  for (const s of [0, 1] as Side[]) {
    const r = placeArmy(cfg.armies[s], s, board);
    if (r.problem) errors.push(r.problem);
  }
  const v = buildMix(cfg);
  if (!v) return { errors, warnings };
  const pieces = Object.values(v.pieces);
  const r = cfg.rules;
  for (const s of [0, 1] as Side[]) {
    const hasRoyal = v.setup.some(p => p.side === s && v.pieces[p.type]?.royal) ||
      Object.keys(v.initialHandsBySide?.[s] ?? {}).some(t => v.pieces[t]?.royal);
    if (r.win !== 'captureAll' && !hasRoyal)
      errors.push(L(`${v.sideNames[s]}沒有王，無法以將死或吃王分勝負`, `${v.sideNamesEn?.[s] ?? v.sideNames[s]} has no king, so it cannot be mated or captured`));
  }
  if (r.chasing === 'axf' && pieces.some(p => !p.xqRole))
    warnings.push(L('長捉判定只認得象棋的兵種；其他棋子不會被判為長捉', 'Perpetual-chase rulings only recognise xiangqi pieces; other pieces never count as chasing'));
  if (r.counting && !pieces.some(p => p.countAs))
    warnings.push(L('數步的上限依泰國象棋的棋子計算；這兩支軍隊沒有對應的棋子，數步只會用預設上限', 'Counting limits are defined by makruk pieces; these armies have none, so only default limits apply'));
  if (r.castling && !pieces.some(p => p.castlePartner))
    warnings.push(L('已開啟入堡，但雙方都沒有可以入堡的棋子', 'Castling is on, but neither army has a castling partner'));
  if (r.mustDrop && !v.initialHandsBySide?.some(h => Object.keys(h).length))
    warnings.push(L('已開啟開局佈陣，但雙方開局手上都沒有棋子', 'The placement phase is on, but neither army starts with pieces in hand'));
  if (!r.drops && v.initialHandsBySide?.some(h => Object.keys(h).length))
    errors.push(L('緬甸象棋軍隊要從手上佈陣，請開啟「打入」與「開局佈陣」', 'The Sittuyin army is placed from hand: turn on drops and the placement phase'));
  return { errors, warnings };
}

export function buildMix(cfg: MixConfig): VariantDef | null {
  const bsrc = preset(cfg.board);
  const board = bsrc.board;
  const [a0, a1] = cfg.armies.map(preset);
  const p0 = placeArmy(cfg.armies[0], 0, board), p1 = placeArmy(cfg.armies[1], 1, board);
  if (p0.problem || p1.problem) return null;
  // 兩方不能重疊
  const used = new Set(p0.placements.map(p => `${p.x},${p.y}`));
  if (p1.placements.some(p => used.has(`${p.x},${p.y}`))) return null;
  const name = (a: VariantDef) => a.name.replace(/象棋$|將棋$|棋$/, '');
  return {
    id: 'mix-' + Date.now(),
    name: a0.id === a1.id ? `${a0.name}（${bsrc.name}棋盤）` : `${name(a0)}軍 對 ${name(a1)}軍`,
    nameEn: a0.id === a1.id ? `${a0.nameEn} (on a ${bsrc.nameEn} board)` : `${a0.nameEn} vs ${a1.nameEn}`,
    description: `自由組合：${bsrc.name}棋盤，${a0.sideNames[0]}用${a0.name}的軍隊，${a1.sideNames[1]}用${a1.name}的軍隊。`,
    descriptionEn: `Mix: ${bsrc.nameEn} board, ${a0.sideNamesEn?.[0]} plays the ${a0.nameEn} army and ${a1.sideNamesEn?.[1]} the ${a1.nameEn} army.`,
    board: { ...board },
    pieces: { ...a0.pieces, ...a1.pieces },
    setup: [...p0.placements, ...p1.placements],
    initialHandsBySide: [{ ...a0.initialHands }, { ...a1.initialHands }],
    rules: { ...cfg.rules },
    sideNames: [a0.sideNames[0], a1.sideNames[1]],
    sideNamesEn: [a0.sideNamesEn?.[0] ?? a0.sideNames[0], a1.sideNamesEn?.[1] ?? a1.sideNames[1]],
    sideColors: [a0.sideColors[0], a1.sideColors[1]],
    custom: true,
  };
}
