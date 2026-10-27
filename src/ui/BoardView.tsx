import type { ReactNode } from 'react';
import type { Piece, VariantDef } from '../engine/types';
import { PieceGlyph } from './PieceGlyph';

export const S = 60;

interface Props {
  variant: VariantDef;
  board: (Piece | null)[];
  flipped?: boolean;
  selected?: number;
  targets?: Map<number, 'move' | 'capture'>;
  lastMove?: [number, number];
  checkSqs?: number[];
  /** 教學關卡的星星 */
  stars?: number[];
  /** 提示：要強調的格子 */
  hint?: number[];
  /** 可以擺放的區域（淡色標示） */
  camp?: number[];
  /** 迷霧：這幾排（y）蓋上霧 */
  fogRows?: number[];
  /** 格子上的文字標記（物品等） */
  marks?: { sq: number; text: string; cls?: string }[];
  /** 危險：即將被捲出畫面的格子 */
  doom?: number[];
  /** 查看對方棋子：它下一步可以走到的格子 */
  peek?: { sq: number; targets: Map<number, 'move' | 'capture'> };
  onCell?: (sq: number) => void;
}

export function BoardView({ variant, board, flipped, selected, targets, lastMove, checkSqs, stars, hint, camp, peek, fogRows, marks: textMarks, doom, onCell }: Props) {
  const { width: W, height: H, cell, checkered, river, palaces = [] } = variant.board;
  const zone = variant.rules.promotionZone;
  const isVoid = new Set((variant.board.voids ?? []).map(([x, y]) => y * W + x));
  const pad = S * 0.45;
  const dispX = (x: number) => (flipped ? W - 1 - x : x);
  const dispY = (y: number) => (flipped ? y : H - 1 - y);
  const cx = (x: number) => (dispX(x) + 0.5) * S;
  const cy = (y: number) => (dispY(y) + 0.5) * S;
  const sqXY = (sq: number) => [sq % W, Math.floor(sq / W)] as const;

  const bg: ReactNode[] = [];
  if (cell === 'square') {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isVoid.has(y * W + x)) continue;
      const dark = checkered && (x + y) % 2 === 0;
      const inZone = !checkered && zone > 0 && (y < zone || y >= H - zone);
      bg.push(<rect key={`c${x},${y}`} x={dispX(x) * S} y={dispY(y) * S} width={S} height={S}
        className={checkered ? (dark ? 'sq-dark' : 'sq-light') : inZone ? 'sq-wood zone' : 'sq-wood'}
        stroke={checkered ? 'none' : 'var(--board-line)'} strokeWidth={1} />);
    }
    if (variant.board.diagonals) {
      bg.push(<line key="d1" x1={cx(0)} y1={cy(0)} x2={cx(W - 1)} y2={cy(H - 1)} stroke="var(--board-line)" strokeWidth={2} opacity={0.55} />);
      bg.push(<line key="d2" x1={cx(W - 1)} y1={cy(0)} x2={cx(0)} y2={cy(H - 1)} stroke="var(--board-line)" strokeWidth={2} opacity={0.55} />);
    }
    if (river) bg.push(<line key="river" x1={0} x2={W * S} y1={(H / 2) * S} y2={(H / 2) * S} stroke="var(--river)" strokeWidth={5} />);
    palaces.forEach((p, i) => {
      const x1 = Math.min(cx(p.x), cx(p.x + p.w - 1)), x2 = Math.max(cx(p.x), cx(p.x + p.w - 1));
      const y1 = Math.min(cy(p.y), cy(p.y + p.h - 1)), y2 = Math.max(cy(p.y), cy(p.y + p.h - 1));
      bg.push(<g key={`p${i}`} stroke="var(--palace)" strokeWidth={2} opacity={0.7}>
        <rect x={x1 - S / 2} y={y1 - S / 2} width={x2 - x1 + S} height={y2 - y1 + S} fill="none" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} /><line x1={x2} y1={y1} x2={x1} y2={y2} />
      </g>);
    });
  } else {
    bg.push(<rect key="wood" x={-pad * 0.4} y={-pad * 0.4} width={W * S + pad * 0.8} height={H * S + pad * 0.8} className="sq-wood" rx={4} />);
    const x0 = S / 2, x1 = (W - 0.5) * S, y0 = S / 2, y1 = (H - 0.5) * S;
    for (let y = 0; y < H; y++) bg.push(<line key={`h${y}`} x1={x0} x2={x1} y1={(y + 0.5) * S} y2={(y + 0.5) * S} className="grid" />);
    const midTop = (H / 2 - 0.5) * S, midBot = (H / 2 + 0.5) * S; // 顯示座標中的河界上下緣
    for (let x = 0; x < W; x++) {
      const X = (x + 0.5) * S;
      if (river && H % 2 === 0 && x > 0 && x < W - 1) {
        bg.push(<line key={`v${x}a`} x1={X} x2={X} y1={y0} y2={midTop} className="grid" />);
        bg.push(<line key={`v${x}b`} x1={X} x2={X} y1={midBot} y2={y1} className="grid" />);
      } else bg.push(<line key={`v${x}`} x1={X} x2={X} y1={y0} y2={y1} className="grid" />);
    }
    bg.push(<rect key="border" x={x0 - 6} y={y0 - 6} width={x1 - x0 + 12} height={y1 - y0 + 12} fill="none" className="grid" strokeWidth={3} />);
    if (river && H % 2 === 0) {
      const ry = (H / 2) * S;
      bg.push(<text key="r1" x={W * S * 0.27} y={ry} className="river-text" textAnchor="middle" dominantBaseline="central" fontSize={S * 0.5}>楚 河</text>);
      bg.push(<text key="r2" x={W * S * 0.73} y={ry} className="river-text" textAnchor="middle" dominantBaseline="central" fontSize={S * 0.5}>漢 界</text>);
    }
    // 交叉點棋盤的空洞：用背景色蓋掉該點的線
    isVoid.forEach(sq => {
      const x = sq % W, y = Math.floor(sq / W);
      bg.push(<rect key={`void${sq}`} x={cx(x) - S / 2} y={cy(y) - S / 2} width={S} height={S} fill="var(--bg)" />);
    });
    palaces.forEach((p, i) => {
      bg.push(<g key={`p${i}`} className="grid">
        <line x1={cx(p.x)} y1={cy(p.y)} x2={cx(p.x + p.w - 1)} y2={cy(p.y + p.h - 1)} />
        <line x1={cx(p.x + p.w - 1)} y1={cy(p.y)} x2={cx(p.x)} y2={cy(p.y + p.h - 1)} />
      </g>);
    });
  }

  // 座標
  const coords: ReactNode[] = [];
  for (let x = 0; x < W; x++)
    coords.push(<text key={`fx${x}`} x={cx(x)} y={H * S + pad * 0.62} className="coord" textAnchor="middle" dominantBaseline="central">{String.fromCharCode(97 + x)}</text>);
  for (let y = 0; y < H; y++)
    coords.push(<text key={`fy${y}`} x={-pad * 0.62} y={cy(y)} className="coord" textAnchor="middle" dominantBaseline="central">{y + 1}</text>);

  const highlights: ReactNode[] = [];
  const hl = (sq: number, cls: string, key: string) => {
    const [x, y] = sqXY(sq);
    highlights.push(<rect key={key} x={cx(x) - S / 2} y={cy(y) - S / 2} width={S} height={S} className={cls} rx={cell === 'intersection' ? S / 2 : 0} />);
  };
  camp?.forEach((sq, i) => hl(sq, 'hl-zone', `camp${i}`));
  doom?.forEach((sq, i) => hl(sq, 'hl-doom', `doom${i}`));
  textMarks?.forEach(m => {
    const [x, y] = sqXY(m.sq);
    highlights.push(<text key={`tm${m.sq}`} x={cx(x)} y={cy(y)} className={`tmark ${m.cls ?? ''}`} textAnchor="middle" dominantBaseline="central" fontSize={S * 0.5}>{m.text}</text>);
  });
  if (lastMove) { if (lastMove[0] >= 0) hl(lastMove[0], 'hl-last', 'l0'); hl(lastMove[1], 'hl-last', 'l1'); }
  if (selected !== undefined && selected >= 0) hl(selected, 'hl-sel', 'sel');
  if (peek) hl(peek.sq, 'hl-peek', 'peek');
  checkSqs?.forEach((sq, i) => hl(sq, 'hl-check', `chk${i}`));
  hint?.forEach((sq, i) => hl(sq, 'hl-hint', `hint${i}`));
  stars?.forEach(sq => {
    const [x, y] = sqXY(sq);
    highlights.push(<text key={`star${sq}`} x={cx(x)} y={cy(y)} className="star" textAnchor="middle" dominantBaseline="central" fontSize={S * 0.62}>★</text>);
  });

  const pieces: ReactNode[] = [];
  board.forEach((p, sq) => {
    if (!p) return;
    const [x, y] = sqXY(sq);
    pieces.push(<g key={`pc${sq}`} transform={`translate(${cx(x)},${cy(y)})`} className="piece">
      <PieceGlyph def={variant.pieces[p.type]} side={p.side} colors={variant.sideColors}
        r={S * 0.42} facingDown={(p.side === 1) !== !!flipped} />
    </g>);
  });

  const marks: ReactNode[] = [];
  targets?.forEach((kind, sq) => {
    const [x, y] = sqXY(sq);
    marks.push(kind === 'capture'
      ? <circle key={`t${sq}`} cx={cx(x)} cy={cy(y)} r={S * 0.46} className="mark-cap" />
      : <circle key={`t${sq}`} cx={cx(x)} cy={cy(y)} r={S * 0.13} className="mark-move" />);
  });

  peek?.targets.forEach((kind, sq) => {
    const [x, y] = sqXY(sq);
    marks.push(kind === 'capture'
      ? <circle key={`p${sq}`} cx={cx(x)} cy={cy(y)} r={S * 0.46} className="mark-peek-cap" />
      : <circle key={`p${sq}`} cx={cx(x)} cy={cy(y)} r={S * 0.13} className="mark-peek" />);
  });

  fogRows?.forEach(y => {
    marks.push(<rect key={`fog${y}`} x={0} y={dispY(y) * S} width={W * S} height={S} className="fog" />);
  });

  const hits: ReactNode[] = [];
  if (onCell) for (let sq = 0; sq < W * H; sq++) {
    if (isVoid.has(sq)) continue;
    const [x, y] = sqXY(sq);
    hits.push(<rect key={`hit${sq}`} x={cx(x) - S / 2} y={cy(y) - S / 2} width={S} height={S}
      fill="transparent" onClick={() => onCell(sq)} style={{ cursor: 'pointer' }} />);
  }

  return (
    <svg className="board" viewBox={`${-pad} ${-pad} ${W * S + 2 * pad} ${H * S + 2 * pad}`}
      style={{ aspectRatio: `${W * S + 2 * pad} / ${H * S + 2 * pad}` }}>
      {bg}{coords}{highlights}{pieces}{marks}{hits}
    </svg>
  );
}
