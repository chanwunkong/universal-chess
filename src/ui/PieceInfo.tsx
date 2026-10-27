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

/**
 * 棋子資訊列：固定高度、永遠佔位，選不選棋子都不會讓棋盤移動。
 * 只顯示名稱與第一條走法；點一下從下方彈出完整說明。
 */
export function PieceInfo({ variant, piece, onClose }: {
  variant: VariantDef;
  piece: { type: string; side: Side } | null;
  onClose: () => void;
}) {
  const { t, tx, pName, side: sideName } = useLang();
  const [open, setOpen] = useState(false);
  const def = piece ? variant.pieces[piece.type] : undefined;
  if (!piece || !def) {
    return <div className="piece-info empty"><span className="muted small">{t('點任何一枚棋子，可以看它能走到哪裡。', 'Tap any piece to see where it can move.')}</span></div>;
  }
  const lines = describePiece(def, variant);
  return (
    <>
      <div className="piece-info" onClick={() => setOpen(true)}>
        <PieceIcon def={def} side={piece.side} colors={variant.sideColors} size={34} />
        <div className="pi-text">
          <strong>{sideName(variant, piece.side)}・{pName(def)}</strong>
          <span className="pi-line">{tx(lines[0])}</span>
        </div>
        <span className="pi-more">{t('詳細', 'Details')} ›</span>
        <button className="pi-close" onClick={e => { e.stopPropagation(); onClose(); }} aria-label={t('關閉', 'Close')}>✕</button>
      </div>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <div className="modal sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <PieceIcon def={def} side={piece.side} colors={variant.sideColors} size={40} />
              <h3>{sideName(variant, piece.side)}・{pName(def)}</h3>
              <button className="ghost" onClick={() => setOpen(false)}>{t('關閉', 'Close')}</button>
            </div>
            <ul className="piece-rules">{lines.map((l, i) => <li key={i}>{tx(l)}</li>)}</ul>
          </div>
        </div>
      )}
    </>
  );
}
