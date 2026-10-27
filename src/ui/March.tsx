import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from '../engine/engine';
import type { Move, Side } from '../engine/types';
import type { AIRequest } from '../engine/ai.worker';
import { LangToggle, useLang } from '../i18n';
import { STARTS, rotate } from '../campaign/campaign';
import {
  FOG, H, W, afterMove, applyBridge, campOffers, canBridge, bridgeCells, currentCountry, inFinal, isCamp, loadMarchRecords,
  marchVariant, newMarch, recordMarch, scroll, scrollInterval, type CampOffer, type Difficulty, type MarchState,
} from '../march/march';
import { PIECE_LIBRARY } from '../mix/build';
import { PRESETS } from '../variants/presets';
import { BoardView } from './BoardView';
import { PieceIcon } from './PieceGlyph';
import { PieceInfo, peekTargets } from './PieceInfo';

type Phase = 'menu' | 'march' | 'camp' | 'over';
const preset = (id: string) => PRESETS.find(v => v.id === id)!;

export function March({ onBack }: { onBack: () => void }) {
  const { t, tx, vName, pName } = useLang();
  const [phase, setPhase] = useState<Phase>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [start, setStart] = useState('chess');
  const [s, setS] = useState<MarchState | null>(null);
  const [selected, setSelected] = useState<{ sq: number } | { drop: string } | null>(null);
  const [peek, setPeek] = useState<number | null>(null);
  const [thinking, setThinking] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [offers, setOffers] = useState<CampOffer[]>([]);
  const [bridge, setBridge] = useState<{ cells: [number, number][]; anchor?: [number, number] } | null>(null);
  const [promo, setPromo] = useState<Move[] | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const records = loadMarchRecords();

  const variant = useMemo(() => (s ? marchVariant(s) : null), [s]);
  const engine = useMemo(() => (variant ? new Engine(variant) : null), [variant]);
  useEffect(() => () => { workerRef.current?.terminate(); workerRef.current = null; }, []);

  function finish(next: MarchState, win: boolean, reason?: { zh: string; en: string }) {
    const done = { ...next, over: next.over ?? { win, reason: reason ?? { zh: '', en: '' } } };
    recordMarch(done.difficulty, done.distance, win);
    setS(done);
    setPhase('over');
  }

  /** 換國家時顯示提示 */
  function announce(prev: MarchState, next: MarchState) {
    const a = currentCountry(prev)?.id, b = currentCountry(next)?.id;
    if (inFinal(next) && !inFinal(prev)) setToast(t('抵達王城：將死國王才能完成行軍！', 'The king’s castle: checkmate the king to finish the march!'));
    else if (a !== b && b) {
      const c = currentCountry(next)!;
      setToast(t(`進入${vName(preset(b))}國境：${c.ruleNote.zh}`, `Entering ${vName(preset(b))}: ${c.ruleNote.en}`));
    }
  }

  /** 敵軍走完一步之後：計步、捲動、營地 */
  function endRound(after: MarchState) {
    let next = { ...after, game: { ...after.game, turn: 0 as Side }, movesSinceScroll: after.movesSinceScroll + 1 };
    if (!inFinal(next) && next.movesSinceScroll >= scrollInterval(next)) {
      const scrolled = scroll(next);
      announce(next, scrolled);
      next = scrolled;
      if (next.over) { finish(next, false); return; }
      if (isCamp(next)) { setS(next); setOffers(campOffers(next)); setPhase('camp'); return; }
    }
    setS(next);
  }

  function enemyTurn(cur: MarchState) {
    const v = marchVariant(cur);
    const e = new Engine(v);
    const g = { ...cur.game, turn: 1 as Side };
    const ms = e.legalMoves(g).filter(m => !m.pass);
    if (!ms.length) { endRound(cur); return; }
    if (!workerRef.current) workerRef.current = new Worker(new URL('../engine/ai.worker.ts', import.meta.url), { type: 'module' });
    setThinking(true);
    workerRef.current.onmessage = (ev: MessageEvent<{ id: number; move: Move | null }>) => {
      setThinking(false);
      const m = ev.data.move;
      if (!m) { endRound(cur); return; }
      let next = afterMove({ ...cur, game: e.makeMove(g, m) }, m, 1);
      if (!next.game.board.some(p => p?.side === 0 && p.type === 'mflag')) {
        finish(next, false, { zh: '軍旗被奪走', en: 'Your standard was captured' });
        return;
      }
      if (inFinal(next)) {
        const r = e.result({ ...next.game, turn: 0 });
        if (r.kind === 'win' && r.winner === 1) { finish(next, false, r.reason); return; }
      }
      next = { ...next, game: { ...next.game, turn: 0 } };
      endRound(next);
    };
    const level = cur.difficulty === 'hard' || cur.distance > 60 ? 'normal' : 'easy';
    const req: AIRequest = { id: Date.now(), variant: v, state: g, level };
    workerRef.current.postMessage(req);
  }

  function playerMove(m: Move) {
    if (!s || !engine) return;
    setSelected(null);
    setPeek(null);
    setPromo(null);
    let next = afterMove({ ...s, game: engine.makeMove({ ...s.game, turn: 0 }, m) }, m, 0);
    announce(s, next);
    if (inFinal(next)) {
      const r = new Engine(marchVariant(next)).result(next.game);
      if (r.kind === 'win' && r.winner === 0) { finish(next, true, r.reason); return; }
    }
    next = { ...next, game: { ...next.game, turn: 1 } };
    setS(next);
    enemyTurn(next);
  }

  // ---------------- 選單 ----------------
  if (phase === 'menu' || !s || !variant || !engine) {
    return (
      <div className="campaign">
        <header className="topbar">
          <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
          <h2>{t('無盡行軍', 'Endless March')}</h2>
          <LangToggle />
        </header>
        <p className="muted">{t('一場不中斷的行軍：棋盤每隔幾步就往前捲動一排，留在最後一排的棋子會被拋下。一路穿越各國（進入國境時全場換成該國規則），打倒頭目，最後在王城將死國王。軍旗被奪走或被拋下就結束。',
          'One unbroken march: every few moves the board scrolls forward and anything left on the last row is lost. Cross countries (the whole board switches to their rules), defeat bosses, and finally checkmate the king in his castle. Lose your standard and the march ends.')}</p>
        <div className="records">
          <span>{t('簡單', 'Easy')}：{t(`最遠 ${records.easy.best} 排・完成 ${records.easy.clears} 次`, `farthest ${records.easy.best} · finished ${records.easy.clears}×`)}</span>
          <span>{t('困難', 'Hard')}：{t(`最遠 ${records.hard.best} 排・完成 ${records.hard.clears} 次`, `farthest ${records.hard.best} · finished ${records.hard.clears}×`)}</span>
        </div>
        <h3>{t('難度', 'Difficulty')}</h3>
        <div className="seg mix-seg">
          <button className={difficulty === 'easy' ? 'on' : ''} onClick={() => setDifficulty('easy')}>{t('簡單：營地可讓陣亡棋子歸隊', 'Easy: the fallen rejoin at camps')}</button>
          <button className={difficulty === 'hard' ? 'on' : ''} onClick={() => setDifficulty('hard')}>{t('困難：陣亡即永久失去', 'Hard: losses are permanent')}</button>
        </div>
        <h3>{t('起始軍隊', 'Starting army')}</h3>
        <div className="mix-options compact">
          {STARTS.map(st => {
            const v = preset(st.id);
            return (
              <button key={st.id} className={start === st.id ? 'selected' : ''} onClick={() => setStart(st.id)}>
                <span className="kit">{st.kit.map((k, i) => <PieceIcon key={i} def={PIECE_LIBRARY[k].def} side={0} colors={v.sideColors} size={22} />)}</span>
                <span className="small">{vName(v)}</span>
              </button>
            );
          })}
        </div>
        <div className="btns">
          <button className="primary" onClick={() => { const m = newMarch(difficulty, start); setS(m); setPhase('march'); setToast(null); }}>{t('出發', 'Set out')}</button>
        </div>
      </div>
    );
  }

  // ---------------- 結束 ----------------
  if (phase === 'over') {
    const names = s.visited.map(id => (id === 'king' ? t('王城', 'the castle') : vName(preset(id))));
    return (
      <div className="campaign result">
        <h2>{s.over?.win ? t('行軍完成！', 'March complete!') : t('行軍結束', 'The march is over')}</h2>
        {s.over?.reason && <p>{tx(s.over.reason)}</p>}
        <p>{t(`前進 ${s.distance} 排・吃掉 ${s.captures} 枚敵子・擊敗 ${s.bosses} 個頭目`, `${s.distance} rows · ${s.captures} captures · ${s.bosses} bosses`)}</p>
        <p className="muted">{t('經過：', 'Crossed: ')}{names.join(' → ')}</p>
        <div className="btns"><button className="primary" onClick={() => setPhase('menu')}>{t('回到選單', 'Back to menu')}</button></div>
      </div>
    );
  }

  const colors = variant.sideColors;
  const game = { ...s.game, turn: 0 as Side };
  const myTurn = phase === 'march' && s.game.turn === 0 && !thinking;
  const legal = myTurn ? engine.legalMoves(game) : [];
  const matches = (m: Move) => !m.pass && selected && ('sq' in selected ? m.from === selected.sq : m.from < 0 && m.type === selected.drop);
  const targets = new Map<number, 'move' | 'capture'>();
  for (const m of legal) if (matches(m)) targets.set(m.to, m.capture ? 'capture' : 'move');
  const fogY = Array.from({ length: FOG }, (_, i) => H - 1 - i);
  const fogSq = (sq: number) => Math.floor(sq / W) >= H - FOG;
  const shown = s.game.board.map((p, sq) => (p && p.side === 1 && fogSq(sq) ? null : p));
  const left = scrollInterval(s) - s.movesSinceScroll;
  const doom = !inFinal(s) && left <= 1 ? Array.from({ length: W }, (_, x) => x) : undefined;
  const country = currentCountry(s);
  const passMove = legal.find(m => m.pass);
  const bridgePreview = bridge?.anchor ? bridgeCells(bridge.cells, bridge.anchor[0], bridge.anchor[1]).filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H).map(([x, y]) => y * W + x) : [];
  const bridgeOk = bridge?.anchor ? canBridge(s, bridge.cells, bridge.anchor[0], bridge.anchor[1]) : false;

  function onCell(sq: number) {
    if (!s) return;
    if (phase === 'camp' && bridge) { setBridge({ ...bridge, anchor: [sq % W, Math.floor(sq / W)] }); return; }
    if (!myTurn) { setPeek(s.game.board[sq] ? sq : null); return; }
    const p = s.game.board[sq];
    if (selected && targets.has(sq)) {
      const cands = legal.filter(m => matches(m) && m.to === sq);
      if (cands.length > 1) setPromo(cands); else playerMove(cands[0]);
      return;
    }
    if (p?.side === 0) { setPeek(null); setSelected(selected && 'sq' in selected && selected.sq === sq ? null : { sq }); }
    else if (p && !fogSq(sq)) { setSelected(null); setPeek(peek === sq ? null : sq); }
    else { setSelected(null); setPeek(null); }
  }

  const hand = Object.entries(s.game.hands[0]).filter(([, n]) => n > 0);
  const infoSq = peek ?? (selected && 'sq' in selected ? selected.sq : null);
  const infoPiece = infoSq !== null ? s.game.board[infoSq] : null;
  const itemMarks = Object.entries(s.items).filter(([sq]) => !fogSq(Number(sq)))
    .map(([sq, it]) => ({ sq: Number(sq), text: it === 'supply' ? '★' : '✚', cls: it }));

  return (
    <div className="campaign march">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{inFinal(s) ? t('王城', 'The castle') : country ? t(`${vName(preset(country.id))}國境`, vName(preset(country.id))) : ''}</h2>
        <LangToggle />
      </header>
      <div className="status">
        <span className="status-text">
          {thinking ? t('敵軍行動中…', 'The enemy is moving…')
            : inFinal(s) ? t('將死國王！', 'Checkmate the king!')
              : t(`再 ${left} 步捲動`, `Scroll in ${left}`)}
        </span>
        <span className="points">★ {s.points}</span>
      </div>
      <p className="muted small">{t(`前進 ${s.distance} 排`, `${s.distance} rows`)}{country && !inFinal(s) ? `・${tx(country.ruleNote)}` : ''}</p>
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
      {infoPiece && <PieceInfo variant={variant} type={infoPiece.type} side={infoPiece.side} onClose={() => { setPeek(null); setSelected(null); }} />}

      <div className="lesson-board">
        <BoardView variant={variant} board={shown} selected={selected && 'sq' in selected ? selected.sq : undefined}
          targets={targets} fogRows={fogY} marks={itemMarks} doom={doom}
          peek={peek !== null && s.game.board[peek] ? { sq: peek, targets: peekTargets(engine, { ...s.game, turn: s.game.board[peek]!.side }, peek) } : undefined}
          hint={bridgeOk ? bridgePreview : undefined} checkSqs={bridge?.anchor && !bridgeOk ? bridgePreview : undefined}
          lastMove={s.game.last ? [s.game.last.from, s.game.last.to] : undefined} onCell={onCell} />
      </div>
      {hand.length > 0 && phase === 'march' && (
        <div className="hand active">
          <span className="hand-label">{t('援軍', 'Reinforcements')}</span>
          {hand.map(([type, n]) => (
            <button key={type} className={`hand-piece ${selected && 'drop' in selected && selected.drop === type ? 'selected' : ''}`}
              disabled={!myTurn} onClick={() => setSelected({ drop: type })}>
              <PieceIcon def={variant.pieces[type]} side={0} colors={colors} size={34} />
              {n > 1 && <span className="count">×{n}</span>}
            </button>
          ))}
        </div>
      )}

      {phase === 'march' && (
        <nav className="actionbar">
          <button onClick={() => { if (confirm(t('結束這次行軍？', 'End this march?'))) finish(s, false, { zh: '放棄行軍', en: 'Abandoned' }); }}><i>✕</i>{t('放棄', 'Give up')}</button>
          {passMove && <button disabled={!myTurn} onClick={() => playerMove(passMove)}><i>⏸</i>{t('停著', 'Pass')}</button>}
        </nav>
      )}

      {promo && (
        <div className="modal-bg" onClick={() => setPromo(null)}>
          <div className="modal sheet" onClick={e => e.stopPropagation()}>
            <h3>{t('選擇升變', 'Promotion')}</h3>
            <div className="promo-list">
              {promo.map((m, i) => (
                <button key={i} onClick={() => playerMove(m)}>
                  <PieceIcon def={variant.pieces[m.promo ?? m.type]} side={0} colors={colors} size={44} />
                  <span>{m.promo ? pName(variant.pieces[m.promo]) : t('不升變', 'No promotion')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'camp' && (
        <div className="camp-panel">
          <h3>{t('營地', 'Camp')}</h3>
          <p className="muted small">{t('用戰功招募援軍（放進手上，之後部署到己方最後兩排），或買架橋方塊補上斷路。', 'Recruit reinforcements (they go to your hand and deploy on your last two rows) or buy bridge tiles to fill gaps.')}</p>
          {bridge ? (
            <div className="btns">
              <span className="muted small">{t('點棋盤選位置（要蓋到至少一個空洞）', 'Tap the board to position it (it must cover a gap)')}</span>
              <button onClick={() => setBridge({ ...bridge, cells: rotate(bridge.cells) as [number, number][] })}>⟳ {t('旋轉', 'Rotate')}</button>
              <button className="primary" disabled={!bridgeOk} onClick={() => { if (bridge.anchor) setS(applyBridge(s, bridge.cells, bridge.anchor[0], bridge.anchor[1])); setBridge(null); }}>{t('架橋', 'Build')}</button>
              <button onClick={() => setBridge(null)}>{t('取消', 'Cancel')}</button>
            </div>
          ) : (
            <div className="shop">
              {offers.map((o, i) => (
                <button key={i} disabled={s.points < o.cost} onClick={() => {
                  const rest = offers.filter((_, j) => j !== i);
                  setOffers(rest);
                  if (o.kind === 'piece') {
                    setS({ ...s, points: s.points - o.cost, game: { ...s.game, hands: [{ ...s.game.hands[0], [o.type]: (s.game.hands[0][o.type] ?? 0) + 1 }, s.game.hands[1]] } });
                  } else {
                    setS({ ...s, points: s.points - o.cost });
                    setBridge({ cells: o.cells });
                  }
                }}>
                  {o.kind === 'piece' ? <PieceIcon def={variant.pieces[o.type]} side={0} colors={colors} size={34} /> : <span className="kit">🌉</span>}
                  <span className="small">{o.kind === 'piece' ? pName(variant.pieces[o.type]) : t('架橋方塊', 'Bridge tile')}</span>
                  <span className="cost">★ {o.cost}</span>
                </button>
              ))}
            </div>
          )}
          {s.difficulty === 'easy' && s.lost.length > 0 && !bridge && (
            <div className="btns">
              <button onClick={() => {
                const h = { ...s.game.hands[0] };
                for (const tp of s.lost) h[tp] = (h[tp] ?? 0) + 1;
                setS({ ...s, lost: [], game: { ...s.game, hands: [h, s.game.hands[1]] } });
              }}>{t(`陣亡棋子歸隊（${s.lost.length} 枚）`, `The fallen rejoin (${s.lost.length})`)}</button>
            </div>
          )}
          <div className="btns"><button className="primary" disabled={!!bridge} onClick={() => setPhase('march')}>{t('繼續行軍', 'March on')}</button></div>
        </div>
      )}
    </div>
  );
}
