import { useState } from 'react';
import type { Engine } from '../engine/engine';
import type { GameState, Side, VariantDef } from '../engine/types';
import { useLang } from '../i18n';
import { describePiece } from '../tutorial/describe';
import { PieceIcon } from './PieceGlyph';

/** 某枚棋子（不論是哪一方）在這個局面下一步可以走到的格子 */
export function peekTargets(engine: Engine, st: GameState, sq: number): Map<number, 'move' | 'capture'> {
  const p = st.board[sq];
  const t = new Map<number, 'move' | 'capture'>();
  if (!p) return t;
  const asTurn: GameState = p.side === st.turn ? st : { ...st, turn: p.side, ep: -1 };
  for (const m of engine.legalMoves(asTurn)) if (m.from === sq && !m.pass) t.set(m.to, m.capture ? 'capture' : 'move');
  return t;
}

/** 棋子資訊列：名稱、屬於哪一方、走法說明 */
export function PieceInfo({ variant, type, side, onClose }: { variant: VariantDef; type: string; side: Side; onClose: () => void }) {
  const { t, tx, pName, side: sideName } = useLang();
  const [open, setOpen] = useState(false);
  const def = variant.pieces[type];
  if (!def) return null;
  const lines = describePiece(def, variant);
  return (
    <div className="piece-info">
      <PieceIcon def={def} side={side} colors={variant.sideColors} size={34} />
      <div className="pi-text" onClick={() => setOpen(o => !o)}>
        <strong>{sideName(variant, side)}・{pName(def)}</strong>
        <ul>
          {(open ? lines : lines.slice(0, 1)).map((l, i) => <li key={i}>{tx(l)}</li>)}
        </ul>
        {lines.length > 1 && !open && <span className="muted small">{t('點這裡看完整走法', 'Tap for all moves')}</span>}
      </div>
      <button className="pi-close" onClick={onClose} aria-label={t('關閉', 'Close')}>✕</button>
    </div>
  );
}
