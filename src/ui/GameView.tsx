import { useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from '../engine/engine';
import type { GameState, Move, Result, Side, VariantDef } from '../engine/types';
import type { AIRequest } from '../engine/ai.worker';
import { BoardView } from './BoardView';
import { PieceIcon } from './PieceGlyph';

type Player = 'human' | 'ai';
type Level = AIRequest['level'];

interface Props {
  variant: VariantDef;
  onBack: () => void;
  onEdit?: () => void;
}

export function GameView({ variant, onBack, onEdit }: Props) {
  const engine = useMemo(() => new Engine(variant), [variant]);
  const [history, setHistory] = useState<GameState[]>(() => [engine.initialState()]);
  const [moves, setMoves] = useState<Move[]>([]);
  const [selected, setSelected] = useState<{ sq: number } | { drop: string } | null>(null);
  const [promoChoice, setPromoChoice] = useState<Move[] | null>(null);
  const [players, setPlayers] = useState<[Player, Player]>(['human', 'human']);
  const [level, setLevel] = useState<Level>('normal');
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
    const h = engine.hash(st);
    const repeats = history.filter(s => engine.hash(s) === h).length;
    return engine.result(st, repeats);
  }, [engine, st, history, claimed]);
  const countInfo = engine.countStatus(st);
  const over = result.kind !== 'ongoing';
  const aiTurn = !over && players[st.turn] === 'ai';
  const humanTurn = !over && players[st.turn] === 'human';

  function restart() {
    reqId.current++;
    setHistory([engine.initialState()]);
    setMoves([]);
    setSelected(null);
    setPromoChoice(null);
    setThinking(false);
    setClaimed(null);
  }
  // 變體改變時重新開始
  useEffect(restart, [engine]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(m: Move) {
    setHistory(h => [...h, engine.makeMove(h[h.length - 1], m)]);
    setMoves(ms => [...ms, m]);
    setSelected(null);
    setPromoChoice(null);
  }

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
    if (over || aiTurn || promoChoice) return;
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
    : result.kind === 'win' && result.reason === '將死' ? engine.royals(st, st.turn) : [];
  const passMove = legal.find(m => m.pass);

  const hand = (side: Side) => {
    if (!variant.rules.drops) return null;
    const entries = Object.entries(st.hands[side]).filter(([, n]) => n > 0);
    return (
      <div className={`hand ${st.turn === side ? 'active' : ''}`}>
        <span className="hand-label">{variant.sideNames[side]} 持駒</span>
        {entries.length === 0 && <span className="muted">（無）</span>}
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

  const status = result.kind === 'win'
    ? `${variant.sideNames[result.winner]}獲勝（${result.reason}）`
    : result.kind === 'draw' ? `和棋（${result.reason}）`
      : `輪到${variant.sideNames[st.turn]}${result.check ? '・將軍！' : ''}${thinking ? '・AI 思考中…' : ''}`;

  const topSide: Side = flipped ? 0 : 1;
  const lastText = last ? `${moves.length}. ${engine.notation(last, history[moves.length - 1].turn)}` : '';

  return (
    <div className={`game ${variant.rules.drops ? 'has-hands' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="返回">‹</button>
        <h2>{variant.name}</h2>
      </header>

      <div className={`status ${over ? 'over' : ''}`}>
        <span className="turn-dot" style={{ background: variant.sideColors[st.turn] }} />
        <span className="status-text">{status}</span>
        {lastText && <span className="last-move">{lastText}</span>}
      </div>
      {countInfo && !over && (
        <div className="count-bar">
          {countInfo.kind === 'board' ? '棋盤數' : '棋子數'}・{variant.sideNames[countInfo.side]}數步：
          第 <b>{Math.ceil(countInfo.ply / 2)}</b> / {countInfo.limit / 2} 步
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
        <button onClick={undo} disabled={history.length < 2 && !claimed}><i>↶</i>悔棋</button>
        <button onClick={() => setFlipped(f => !f)}><i>⇅</i>翻轉</button>
        {passMove && <button onClick={() => play(passMove)} disabled={over || aiTurn}><i>⏸</i>停著</button>}
        {humanTurn && engine.canDeclareCount(st, st.turn) && (
          <button onClick={() => replaceState(engine.declareCount(st, st.turn))}><i>#</i>開始數步</button>
        )}
        {humanTurn && st.boardCount?.side === st.turn && (
          <button onClick={() => replaceState(engine.stopCount(st))}><i>■</i>停止數步</button>
        )}
        {humanTurn && st.boardCount && st.boardCount.side !== st.turn && (
          <button onClick={() => setClaimed({ kind: 'draw', reason: '對方數步中，宣告和棋' })}><i>½</i>宣告和棋</button>
        )}
        <button className="mobile-only" onClick={() => setPanel('moves')}><i>☷</i>棋譜</button>
        <button className="mobile-only" onClick={() => setPanel('menu')}><i>⚙</i>設定</button>
      </nav>

      {panel && <div className="sheet-bg mobile-only" onClick={() => setPanel(null)} />}
      <aside className={`game-panel ${panel ? 'open' : ''} show-${panel ?? 'none'}`}>
        <div className="sheet-handle mobile-only" onClick={() => setPanel(null)} />
        <section className="panel-menu">
          <h3>對局設定</h3>
          <div className="seg-group">
            {([0, 1] as Side[]).map(s => (
              <div key={s} className="seg-row">
                <span className="seg-label"><span className="turn-dot" style={{ background: variant.sideColors[s] }} />{variant.sideNames[s]}</span>
                <div className="seg">
                  {(['human', 'ai'] as Player[]).map(pl => (
                    <button key={pl} className={players[s] === pl ? 'on' : ''} onClick={() => {
                      const p = [...players] as [Player, Player];
                      p[s] = pl;
                      setPlayers(p);
                    }}>{pl === 'human' ? '玩家' : '電腦'}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="seg-row">
              <span className="seg-label">電腦難度</span>
              <div className="seg">
                {(['easy', 'normal', 'hard'] as Level[]).map(l => (
                  <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
                    {({ easy: '簡單', normal: '普通', hard: '困難' })[l]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="btns">
            <button onClick={() => { restart(); setPanel(null); }}>重新開始</button>
            {onEdit && <button onClick={onEdit}>編輯此變體</button>}
          </div>
          {variant.description && <p className="muted small">{variant.description}</p>}
        </section>
        <section className="panel-moves movelist">
          <h3>棋譜</h3>
          {moves.length === 0 && <p className="muted small">還沒有走棋。</p>}
          <ol>
            {moves.map((m, i) => (
              <li key={i} className={i % 2 ? 'odd' : ''}>{engine.notation(m, history[i].turn)}</li>
            ))}
          </ol>
        </section>
      </aside>

      {promoChoice && (
        <div className="modal-bg" onClick={() => setPromoChoice(null)}>
          <div className="modal sheet" onClick={e => e.stopPropagation()}>
            <h3>選擇升變</h3>
            <div className="promo-list">
              {promoChoice.map((m, i) => {
                const t = m.promo ?? m.type;
                return (
                  <button key={i} onClick={() => play(m)}>
                    <PieceIcon def={variant.pieces[t]} side={st.turn} colors={variant.sideColors} size={48} />
                    <span>{m.promo ? variant.pieces[t]?.name : '不升變'}</span>
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
