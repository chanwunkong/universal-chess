import type { PieceDef, Side } from '../engine/types';

/** 太淺的顏色在淺色棋子上看不清，改用深色墨水 */
function luminance(color: string): number {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return 0.5;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function ink(color: string): string {
  return luminance(color) > 0.6 ? '#5a4a32' : color;
}

/** 黑白配色（西洋棋式）時，圓形與八角形棋子改成一白一黑，才分得出雙方 */
function monoScheme(colors: [string, string], side: Side): { fill: string; line: string; text: string } | null {
  const l0 = luminance(colors[0]), l1 = luminance(colors[1]);
  if (Math.max(l0, l1) <= 0.6) return null;
  // 雙方都是淺色（例如將棋配色）時，後手用深色
  const light = l0 > 0.6 && l1 > 0.6 ? side === 0 : luminance(colors[side]) > 0.6;
  return light ? { fill: '#fbf8ef', line: '#4a4a4a', text: '#2a2a2a' } : { fill: '#2e2e2e', line: '#d8d8d8', text: '#f4f1e8' };
}

interface Props {
  def: PieceDef | undefined;
  side: Side;
  colors: [string, string];
  /** 棋子大小（半徑，SVG 單位） */
  r?: number;
  /** 是否朝下（上方玩家的將棋棋子） */
  facingDown?: boolean;
}

/** 以 (0,0) 為中心繪製棋子 */
export function PieceGlyph({ def, side, colors, r = 26, facingDown }: Props) {
  if (!def) return <circle r={r} fill="#999" />;
  const label = def.labels[side] || '?';
  const color = colors[side];
  const fontSize = (n: number) => r * (n <= 1 ? 1.15 : n === 2 ? 0.78 : n === 3 ? 0.58 : n <= 5 ? 0.44 : 0.36);
  const text = (fill: string, extra: object = {}) => (
    <text textAnchor="middle" dominantBaseline="central" fontSize={fontSize([...label].length)}
      fill={fill} fontWeight={700} className="piece-text" {...extra}>{label}</text>
  );

  switch (def.style) {
    case 'glyph':
      return (
        <g>
          <text textAnchor="middle" dominantBaseline="central" fontSize={r * 1.9} y={r * 0.05}
            fill={color} stroke={side === 0 ? '#222' : '#eee'} strokeWidth={1.2} paintOrder="stroke"
            className="piece-glyph">{label + '︎'}</text>
        </g>
      );
    case 'shogi': {
      const w = r * 0.85, h = r;
      const pts = `0,${-h} ${w * 0.72},${-h * 0.6} ${w},${h} ${-w},${h} ${-w * 0.72},${-h * 0.6}`;
      const promoted = !!def.demotesTo;
      return (
        <g transform={facingDown ? 'rotate(180)' : undefined}>
          <polygon points={pts} fill="#f3d9a4" stroke="#7a5a2a" strokeWidth={1.5} />
          {colors[0] !== colors[1] && <polygon points={pts} fill="none" stroke={color} strokeWidth={3} opacity={0.8} />}
          {text(promoted ? '#c0392b' : '#222', { y: r * 0.12 })}
        </g>
      );
    }
    case 'octagon': {
      const k = r * 0.95;
      const a = k * 0.414;
      const pts = [[a, -k], [k, -a], [k, a], [a, k], [-a, k], [-k, a], [-k, -a], [-a, -k]].map(p => p.join(',')).join(' ');
      const mono = monoScheme(colors, side);
      return (
        <g>
          <polygon points={pts} fill={mono?.fill ?? '#fbf3dd'} stroke={mono?.line ?? ink(color)} strokeWidth={2.5} />
          {text(mono?.text ?? ink(color))}
        </g>
      );
    }
    default: {
      const mono = monoScheme(colors, side);
      return (
        <g>
          <circle r={r} fill={mono?.fill ?? '#f6e3b4'} stroke={mono?.line ?? '#8a6a3a'} strokeWidth={1.5} />
          <circle r={r * 0.82} fill="none" stroke={mono?.line ?? ink(color)} strokeWidth={1.5} />
          {text(mono?.text ?? ink(color))}
        </g>
      );
    }
  }
}

export function PieceIcon({ def, side, colors, size = 40 }: { def: PieceDef | undefined; side: Side; colors: [string, string]; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-30 -30 60 60" className="piece-icon">
      <PieceGlyph def={def} side={side} colors={colors} facingDown={side === 1} />
    </svg>
  );
}
