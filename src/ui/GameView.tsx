import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from '../engine/engine';
import type { GameState, Move, Result, Side, VariantDef } from '../engine/types';
import type { AIRequest } from '../engine/ai.worker';
import { BoardView } from './BoardView';
import { PieceIcon } from './PieceGlyph';
import { LangToggle, useLang } from '../i18n';

type Player = 'human' | 'ai';
type Level = AIRequest['level'];

interface Props {
  variant: VariantDef;
  onBack: () => void;
  onEdit?: () => void;
  /** 一開始就和電腦對下（電腦執後手、簡單難度） */
  vsAI?: boolean;
}

export function GameView({ variant, onBack, onEdit, vsAI }: Props) {
  const { t, tx, vName, vDesc, side: sideName, pName } = useLang();
  const sn = (s: Side) => sideName(variant, s);
  const both = (s: Side) => ({ zh: variant.sideNames[s], en: variant.sideNamesEn?.[s] ?? variant.sideNames[s] });
  const engine = useMemo(() => new Engine(variant), [variant]);
  const [history, setHistory] = useState<GameState[]>(() => [engine.initialState()]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [selected, setSelected] = useState<{ sq: number } | { drop: string } | null>(null);
  const [promoChoice, setPromoChoice] = useState<Move[] | null>(null);
  const [players, setPlayers] = useState<[Player, Player]>(vsAI ? ['human', 'ai'] : ['human', 'human']);
  const [level, setLevel] = useState<Level>(vsAI ? 'easy' : 'normal');
  const [flipped, setFlipped] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'moves' | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  const st = history[history.length - 1];
  const legal = useMemo(() => engine.legalMoves(st), [engine, st]);
  const [claimed, setClaimed] = useState<Result | null>(null);
  const result = useMemo(() => {
    if (claimed) return claimed;
    return engine.result(st, history);
  }, [engine, st, history, claimed]);
  const [claimPending, setClaimPending] = useState(false);
  // 開局擺法選擇（韓國象棋）
  const [choices, setChoices] = useState<(number | null)[]>([null, null]);
  const sc = variant.setupChoice;
  const chooser = sc?.order.find(s => choices[s] == null);
  const choosing = chooser !== undefined;
  const [dialog, setDialog] = useState<{ title: string; lines: string[]; actions: { label: string; primary?: boolean; run: () => void }[] } | null>(null);
  const countInfo = engine.countStatus(st);
  const over = result.kind !== 'ongoing';
  const aiTurn = !over && !choosing && players[st.turn] === 'ai';
  const humanTurn = !over && !choosing && players[st.turn] === 'human';

  function restart() {
    reqId.current++;
    setHistory([engine.initialState()]);
    setChoices([null, null]);
    setMoves([]);
    setSelected(null);
    setPromoChoice(null);
    setThinking(false);
    setClaimed(null);
    setClaimPending(false);
  }
  // 變體改變時重新開始
  useEffect(restart, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(m: Move) {
    if (claimPending) {
      // FIDE 9.2.1.1：先宣告要走的棋，走完後局面符合條件即和棋；不符合則照常續弈
      const next = engine.makeMove(st, m);
      const r = engine.claimReason(next, [...history, next]);
      if (r) setClaimed({ kind: 'draw', reason: { zh: `要求和棋成立（${r.zh}）`, en: `Draw claim accepted (${r.en})` } });
      setClaimPending(false);
    }
    setHistory(h => [...h, engine.makeMove(h[h.length - 1], m)]);
    setMoves(ms => [...ms, m]);
    setSelected(null);
    setPromoChoice(null);
  }

  function choose(side: Side, idx: number) {
    const next = [...choices];
    next[side] = idx;
    setChoices(next);
    setHistory([engine.initialState(next)]);
  }
  // 電腦選擇擺法
  useEffect(() => {
    if (chooser !== undefined && sc && players[chooser] === 'ai') choose(chooser, Math.floor(Math.random() * sc.options.length));
  }, [chooser, players]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 不是走棋的動作（宣告數步等）：取代目前局面，可以悔棋 */
  function replaceState(next: GameState) {
    setHistory(h => [...h.slice(0, -1), next]);
  }
  const material = (side: Side) => st.board.reduce((a, p) => a + (p && p.side === side ? engine.values[p.type] ?? 0 : 0), 0);

  // AI 執行
  useEffect(() => {
    if (!aiTurn) return;
    // 電腦處於劣勢且可以數步時，先宣告棋盤數
    if (engine.canDeclareCount(st, st.turn) && material(st.turn) < material((1 - st.turn) as Side)) {
      replaceState(engine.declareCount(st, st.turn));
      return;
    }
    // 可以要求和棋且子力不佔優時，電腦提出和棋要求
    const claim = engine.claimReason(st, history);
    if (claim && material(st.turn) <= material((1 - st.turn) as Side)) {
      const n = both(st.turn);
      setClaimed({ kind: 'draw', reason: { zh: `${n.zh}要求和棋（${claim.zh}）`, en: `${n.en} claimed a draw (${claim.en})` } });
      return;
    }
    // 入玉宣言能獲勝時，電腦宣言
    if (variant.rules.impasse) {
      const d = engine.impasseDeclaration(st);
      if (d.result.kind === 'win' && d.result.winner === st.turn) {
        setClaimed(d.result);
        return;
      }
    }
    if (!workerRef.current)
      workerRef.current = new Worker(new URL('../engine/ai.worker.ts', import.meta.url), { type: 'module' });
    const w = workerRef.current;
    const id = ++reqId.current;
    setThinking(true);
    w.onmessage = (ev: MessageEvent<{ id: number; move: Move | null }>) => {
      if (ev.data.id !== reqId.current) return;
      setThinking(false);
      if (ev.data.move) play(ev.data.move);
    };
    const req: AIRequest = { id, variant, state: st, level };
    w.postMessage(req);
  }, [aiTurn, st]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  function undo() {
    reqId.current++;
    setThinking(false);
    setClaimPending(false);
    if (claimed) { setClaimed(null); return; }
    // 對 AI 時一次退回到輪到人類
    let n = 1;
    if (players.includes('ai') && players.includes('human')) {
      while (n < history.length - 1 && players[history[history.length - 1 - n].turn] === 'ai') n++;
    }
    if (history.length - n < 1) return;
    setHistory(h => h.slice(0, h.length - n));
    setMoves(ms => ms.slice(0, ms.length - n));
    setSelected(null);
    setPromoChoice(null);
  }

  const targets = useMemo(() => {
    const t = new Map<number, 'move' | 'capture'>();
    if (!selected) return t;
    for (const m of legal) {
      if (m.pass) continue;
      if ('sq' in selected ? m.from === selected.sq : m.from < 0 && m.type === selected.drop)
        t.set(m.to, m.capture ? 'capture' : 'move');
    }
    return t;
  }, [selected, legal]);

  function onCell(sq: number) {
    if (over || aiTurn || promoChoice || choosing) return;
    const p = st.board[sq];
    if (selected && targets.has(sq)) {
      const cands = legal.filter(m => !m.pass && m.to === sq &&
        ('sq' in selected ? m.from === selected.sq : m.from < 0 && m.type === selected.drop));
      if (cands.length === 1) play(cands[0]);
      else setPromoChoice(cands);
      return;
    }
    if (p && p.side === st.turn) setSelected('sq' in (selected ?? {}) && (selected as { sq: number }).sq === sq ? null : { sq });
    else setSelected(null);
  }

  const last = moves[moves.length - 1];
  const checkSqs = result.kind === 'ongoing' && result.check ? engine.royals(st, st.turn)
    : result.kind === 'win' && result.reason.zh === '將死' ? engine.royals(st, st.turn) : [];
  const passMove = legal.find(m => m.pass);

  const hand = (side: Side) => {
    if (!variant.rules.drops) return null;
    const entries = Object.entries(st.hands[side]).filter(([, n]) => n > 0);
    return (
      <div className={`hand ${st.turn === side ? 'active' : ''}`}>
        <span className="hand-label">{sn(side)} {variant.rules.mustDrop ? t('待佈陣', 'to place') : t('持駒', 'in hand')}</span>
        {entries.length === 0 && <span className="muted">{t('（無）', '(none)')}</span>}
        {entries.map(([type, n]) => {
          const sel = selected && 'drop' in selected && selected.drop === type && st.turn === side;
          return (
            <button key={type} className={`hand-piece ${sel ? 'selected' : ''}`}
              disabled={over || aiTurn || st.turn !== side}
              onClick={() => setSelected(sel ? null : { drop: type })}>
              <PieceIcon def={variant.pieces[type]} side={side} colors={variant.sideColors} size={34} />
              {n > 1 && <span className="count">×{n}</span>}
            </button>
          );
        })}
      </div>
    );
  };

  const status = choosing ? t(`等待${sn(chooser!)}選擇開局擺法`, `Waiting for ${sn(chooser!)} to choose a setup`) : result.kind === 'win'
    ? t(`${sn(result.winner)}獲勝（${tx(result.reason)}）`, `${sn(result.winner)} wins (${tx(result.reason)})`)
    : result.kind === 'draw' ? t(`和棋（${tx(result.reason)}）`, `Draw (${tx(result.reason)})`)
      : t(`輪到${sn(st.turn)}`, `${sn(st.turn)} to move`) + (result.check ? t('・將軍！', ' · Check!') : '') +
        (thinking ? t('・電腦思考中…', ' · Computer thinking…') : '') + (claimPending ? t('・請走出要求和棋的那一步', ' · Play the move for your draw claim') : '');

  const topSide: Side = flipped ? 0 : 1;

  const claimNow = humanTurn ? engine.claimReason(st, history) : null;
  const claimAvailable = humanTurn && (!!claimNow || claimPending || (
    !!(variant.rules.repetitionClaim || variant.rules.moveLimitClaim) &&
    legal.some(m => { const n = engine.makeMove(st, m); return !!engine.claimReason(n, [...history, n]); })));

  function requestDraw() {
    if (claimNow) {
      const n = both(st.turn);
      setClaimed({ kind: 'draw', reason: { zh: `${n.zh}要求和棋成立（${claimNow.zh}）`, en: `${n.en} claimed a draw (${claimNow.en})` } });
    }
    else setClaimPending(p => !p);
  }

  function declareImpasse() {
    const d = engine.impasseDeclaration(st);
    setDialog({
      title: t('入玉宣言', 'Impasse declaration'),
      lines: [...d.conditions.map(([c, ok]) => `${ok ? '✔' : '✘'} ${tx(c)}`), '',
        t('宣言結果：', 'Outcome: ') + (d.result.kind === 'draw' ? t('無勝負', 'no result')
          : d.result.kind === 'win' && d.result.winner === st.turn ? t('宣言方勝', 'declarer wins') : t('宣言方負', 'declarer loses'))],
      actions: [{ label: t('取消', 'Cancel'), run: () => {} }, { label: t('宣言', 'Declare'), primary: true, run: () => setClaimed(d.result) }],
    });
  }

  function proposeImpasse() {
    const opp = (1 - st.turn) as Side;
    const r = engine.agreeImpasse(st);
    const pts = t(`${sn(0)} ${engine.impasseTotal(st, 0)} 點、${sn(1)} ${engine.impasseTotal(st, 1)} 點`,
      `${sn(0)} ${engine.impasseTotal(st, 0)}, ${sn(1)} ${engine.impasseTotal(st, 1)} points`);
    if (players[opp] === 'ai') {
      // 電腦只在自己不會因點數不足而輸時同意
      if (engine.impasseTotal(st, opp) >= 24) setClaimed(r);
      else setDialog({ title: t('持將棋', 'Jishōgi'), lines: [t(`電腦不同意持將棋（${pts}）。`, `The computer declines (${pts}).`)], actions: [{ label: t('確定', 'OK'), primary: true, run: () => {} }] });
      return;
    }
    setDialog({
      title: t(`${sn(st.turn)}提議持將棋`, `${sn(st.turn)} proposes jishōgi`),
      lines: [t(`請${sn(opp)}決定是否同意。`, `${sn(opp)}, do you agree?`),
        t(`點數：${pts}（大駒 5 點、小駒 1 點；不足 24 點的一方負）`, `Points: ${pts} (rook/bishop 5, others 1; under 24 loses)`)],
      actions: [{ label: t('不同意', 'Decline'), run: () => {} }, { label: t('同意', 'Agree'), primary: true, run: () => setClaimed(r) }],
    });
  }

  function replaySwapped() {
    setPlayers(p => [p[1], p[0]]);
    restart();
  }
  const note = (m: Move, i: number) => (m.pass ? t('停著', 'Pass') : engine.notation(m, history[i].turn));
  const lastText = last ? `${moves.length}. ${note(last, moves.length - 1)}` : '';

  return (
    <div className={`game ${variant.rules.drops ? 'has-hands' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{vName(variant)}</h2>
        <LangToggle />
      </header>

      <div className={`status ${over ? 'over' : ''}`}>
        <span className="turn-dot" style={{ background: variant.sideColors[st.turn] }} />
        <span className="status-text">{status}</span>
        {lastText && <span className="last-move">{lastText}</span>}
      </div>
      {countInfo && !over && (
        <div className="count-bar">
          {countInfo.kind === 'board' ? t('棋盤數', "Board's honour") : t('棋子數', "Pieces' honour")}・
          {t(`${sn(countInfo.side)}數步：第 `, `${sn(countInfo.side)} counting: `)}
          <b>{Math.ceil(countInfo.ply / 2)}</b> / {countInfo.limit / 2}{t(' 步', '')}
        </div>
      )}

      <div className="game-board">
        {hand(topSide)}
        <BoardView variant={variant} board={st.board} flipped={flipped}
          selected={selected && 'sq' in selected ? selected.sq : undefined}
          targets={targets} lastMove={last && !last.pass ? [last.from, last.to] : undefined}
          checkSqs={checkSqs} onCell={onCell} />
        {hand((1 - topSide) as Side)}
      </div>

      <nav className="actionbar">
        <button onClick={undo} disabled={history.length < 2 && !claimed}><i>↶</i>{t('悔棋', 'Undo')}</button>
        <button onClick={() => setFlipped(f => !f)}><i>⇅</i>{t('翻轉', 'Flip')}</button>
        {passMove && <button onClick={() => play(passMove)} disabled={over || aiTurn}><i>⏸</i>{t('停著', 'Pass')}</button>}
        {humanTurn && engine.canDeclareCount(st, st.turn) && (
          <button onClick={() => replaceState(engine.declareCount(st, st.turn))}><i>#</i>{t('開始數步', 'Start count')}</button>
        )}
        {humanTurn && st.boardCount?.side === st.turn && (
          <button onClick={() => replaceState(engine.stopCount(st))}><i>■</i>{t('停止數步', 'Stop count')}</button>
        )}
        {over && result.kind === 'draw' && result.replay && (
          <button className="primary" onClick={replaySwapped}><i>⇄</i>{t('交換先後重下', 'Replay, swap sides')}</button>
        )}
        {humanTurn && claimAvailable && (
          <button className={claimPending ? 'active' : ''} onClick={requestDraw}><i>½</i>{claimPending ? t('取消要求', 'Cancel claim') : t('要求和棋', 'Claim draw')}</button>
        )}
        {humanTurn && variant.rules.impasse && engine.royals(st, st.turn).some(k => engine.inRegion(k, st.turn, 'promoZone')) && (
          <button onClick={declareImpasse}><i>玉</i>{t('入玉宣言', 'Declare impasse')}</button>
        )}
        {humanTurn && variant.rules.impasse && engine.anyKingEntered(st) && (
          <button onClick={proposeImpasse}><i>持</i>{t('提議持將棋', 'Propose jishōgi')}</button>
        )}
        {humanTurn && st.boardCount && st.boardCount.side !== st.turn && (
          <button onClick={() => setClaimed({ kind: 'draw', reason: { zh: '對方數步中，宣告和棋', en: 'Draw declared during the opponent’s count' } })}><i>½</i>{t('宣告和棋', 'Declare draw')}</button>
        )}
        <button className="mobile-only" onClick={() => setPanel('moves')}><i>☷</i>{t('棋譜', 'Moves')}</button>
        <button className="mobile-only" onClick={() => setPanel('menu')}><i>⚙</i>{t('設定', 'Settings')}</button>
      </nav>

      {panel && <div className="sheet-bg mobile-only" onClick={() => setPanel(null)} />}
      <aside className={`game-panel ${panel ? 'open' : ''} show-${panel ?? 'none'}`}>
        <div className="sheet-handle mobile-only" onClick={() => setPanel(null)} />
        <section className="panel-menu">
          <h3>{t('對局設定', 'Game settings')}</h3>
          <div className="seg-group">
            {([0, 1] as Side[]).map(s => (
              <div key={s} className="seg-row">
                <span className="seg-label"><span className="turn-dot" style={{ background: variant.sideColors[s] }} />{sn(s)}</span>
                <div className="seg">
                  {(['human', 'ai'] as Player[]).map(pl => (
                    <button key={pl} className={players[s] === pl ? 'on' : ''} onClick={() => {
                      const p = [...players] as [Player, Player];
                      p[s] = pl;
                      setPlayers(p);
                    }}>{pl === 'human' ? t('玩家', 'Human') : t('電腦', 'Computer')}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="seg-row">
              <span className="seg-label">{t('電腦難度', 'Difficulty')}</span>
              <div className="seg">
                {(['easy', 'normal', 'hard'] as Level[]).map(l => (
                  <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
                    {({ easy: t('簡單', 'Easy'), normal: t('普通', 'Normal'), hard: t('困難', 'Hard') })[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="btns">
            <button onClick={() => { restart(); setPanel(null); }}>{t('重新開始', 'Restart')}</button>
            {onEdit && <button onClick={onEdit}>{t('編輯此變體', 'Edit this variant')}</button>}
          </div>
          {vDesc(variant) && <p className="muted small">{vDesc(variant)}</p>}
        </section>
        <section className="panel-moves movelist">
          <h3>{t('棋譜', 'Moves')}</h3>
          {moves.length === 0 && <p className="muted small">{t('還沒有走棋。', 'No moves yet.')}</p>}
          <ol>
            {moves.map((m, i) => (
              <li key={i} className={i % 2 ? 'odd' : ''}>{note(m, i)}</li>
            ))}
          </ol>
        </section>
      </aside>

      {choosing && sc && players[chooser!] === 'human' && (
        <div className="modal-bg">
          <div className="modal sheet">
            <h3>{t(`${sn(chooser!)}選擇開局擺法`, `${sn(chooser!)}: choose your setup`)}</h3>
            <p className="muted small">{t(`由左至右是從${sn(chooser!)}的視角看底線。`, `Left to right as seen from ${sn(chooser!)}'s back rank.`)}</p>
            <div className="setup-options">
              {sc.options.map((o, i) => (
                <button key={i} onClick={() => choose(chooser!, i)}>
                  <span className="setup-icons">
                    {o.placements.map((p, j) => (
                      <PieceIcon key={j} def={variant.pieces[p.type]} side={chooser!} colors={variant.sideColors} size={30} />
                    ))}
                  </span>
                  <span>{t(o.name, o.nameEn ?? o.name)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <div className="modal-bg" onClick={() => setDialog(null)}>
          <div className="modal sheet" onClick={e => e.stopPropagation()}>
            <h3>{dialog.title}</h3>
            {dialog.lines.map((l, i) => <p key={i} className="dialog-line">{l}</p>)}
            <div className="btns">
              {dialog.actions.map(a => (
                <button key={a.label} className={a.primary ? 'primary' : ''} onClick={() => { setDialog(null); a.run(); }}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {promoChoice && (
        <div className="modal-bg" onClick={() => setPromoChoice(null)}>
          <div className="modal sheet" onClick={e => e.stopPropagation()}>
            <h3>{t('選擇升變', 'Promotion')}</h3>
            <div className="promo-list">
              {promoChoice.map((m, i) => {
                const pt = m.promo ?? m.type;
                return (
                  <button key={i} onClick={() => play(m)}>
                    <PieceIcon def={variant.pieces[pt]} side={st.turn} colors={variant.sideColors} size={48} />
                    <span>{m.promo ? pName(variant.pieces[pt]) : t('不升變', 'No promotion')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
