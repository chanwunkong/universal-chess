import { useMemo, useState } from 'react';
import { Engine } from '../engine/engine';
import type { GameState, Move, VariantDef } from '../engine/types';
import { LangToggle, useLang } from '../i18n';
import { CATEGORIES, RULES, type Category, type RuleCard } from '../rules/catalog';
import { demoState, demoVariant, moveKey } from '../rules/demo';
import { PRESETS } from '../variants/presets';
import { BoardView } from './BoardView';
import { PieceIcon } from './PieceGlyph';

interface Props {
  onBack: () => void;
  onOpenGame: (v: VariantDef) => void;
}

export function RuleBook({ onBack, onOpenGame }: Props) {
  const { t, tx } = useLang();
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<RuleCard | null>(null);

  const list = RULES.filter(r => (cat === 'all' || r.category === cat) &&
    (!query || [r.name.zh, r.name.en, r.summary.zh, r.summary.en, ...(r.others ?? [])].some(s => s.toLowerCase().includes(query.toLowerCase()))));

  if (open) return <RuleView card={open} onBack={() => setOpen(null)} onOpenGame={onOpenGame} />;

  const playable = RULES.filter(r => r.status === 'playable').length;
  return (
    <div className="rulebook">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{t('規則圖鑑', 'Rule encyclopedia')}</h2>
        <LangToggle />
      </header>
      <p className="muted small">{t(`共 ${RULES.length} 條規則，其中 ${playable} 條可以試玩。每條規則都附出處。`,
        `${RULES.length} rules, ${playable} of them playable. Every rule cites its source.`)}</p>
      <input className="search" placeholder={t('搜尋規則或棋名…', 'Search rules or games…')} value={query} onChange={e => setQuery(e.target.value)} />
      <div className="cat-chips">
        <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>{t('全部', 'All')}</button>
        {CATEGORIES.map(c => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{tx(c.name)}</button>
        ))}
      </div>
      <ul className="rule-list">
        {list.map(r => (
          <li key={r.id}>
            <button onClick={() => setOpen(r)}>
              <span className="rule-title">{tx(r.name)}
                {r.status === 'info' ? <em className="tag">{t('只介紹', 'Info only')}</em> : r.demo ? <em className="tag play">{t('可試玩', 'Try it')}</em> : null}
              </span>
              <span className="muted small">{tx(r.summary)}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted">{t('沒有符合的規則。', 'No matching rules.')}</li>}
      </ul>
    </div>
  );
}

function RuleView({ card, onBack, onOpenGame }: { card: RuleCard; onBack: () => void; onOpenGame: (v: VariantDef) => void }) {
  const { t, tx, vName } = useLang();
  const cat = CATEGORIES.find(c => c.id === card.category)!;
  return (
    <div className="rulebook">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{tx(card.name)}</h2>
        <LangToggle />
      </header>
      <p className="muted small">{tx(cat.name)}{card.status === 'info' ? t('・只介紹，尚未開放試玩', ' · Info only, not playable yet') : ''}</p>
      <p className="rule-summary">{tx(card.summary)}</p>
      {card.details?.map((d, i) => <p key={i}>{tx(d)}</p>)}
      {card.demo && <RuleDemo card={card} />}
      {!!card.games?.length && <>
        <h4>{t('使用這條規則的棋', 'Games that use it')}</h4>
        <div className="chips">
          {card.games.map(id => {
            const v = PRESETS.find(p => p.id === id)!;
            return <button key={id} className="chip" onClick={() => onOpenGame(v)}>{vName(v)}</button>;
          })}
        </div>
      </>}
      {!!card.others?.length && <>
        <h4>{t('其他使用這條規則的棋（本站尚未收錄）', 'Other games using it (not on this site yet)')}</h4>
        <p className="muted small">{card.others.join('、')}</p>
      </>}
      <h4>{t('出處', 'Sources')}</h4>
      <ul className="sources">
        {card.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.label}</a></li>)}
      </ul>
    </div>
  );
}

function RuleDemo({ card }: { card: RuleCard }) {
  const { t, tx, pName } = useLang();
  const demo = card.demo!;
  const variant = useMemo(() => demoVariant(PRESETS.find(p => p.id === demo.base)!, demo), [demo]);
  const engine = useMemo(() => new Engine(variant), [variant]);
  const start = useMemo(() => demoState(engine, demo), [engine, demo]);
  const [st, setSt] = useState<GameState>(start);
  const [selected, setSelected] = useState<{ sq: number } | { drop: string } | null>(null);
  const [msg, setMsg] = useState<'task' | 'done' | 'other'>('task');
  const [last, setLast] = useState<Move | null>(null);
  const [choice, setChoice] = useState<Move[] | null>(null);
  const legal = useMemo(() => (msg === 'done' ? [] : engine.legalMoves(st)), [engine, st, msg]);
  const me = st.turn;

  const matches = (m: Move) => !m.pass && selected && ('sq' in selected ? m.from === selected.sq : m.from < 0 && m.type === selected.drop);
  const targets = new Map<number, 'move' | 'capture'>();
  for (const m of legal) if (matches(m)) targets.set(m.to, m.capture ? 'capture' : 'move');

  function onCell(sq: number) {
    if (msg === 'done') return;
    if (selected && targets.has(sq)) {
      const cands = legal.filter(x => matches(x) && x.to === sq);
      if (cands.length > 1) setChoice(cands);
      else play(cands[0]);
      return;
    }
    const p = st.board[sq];
    setSelected(p && p.side === me ? (selected && 'sq' in selected && selected.sq === sq ? null : { sq }) : null);
  }

  function play(m: Move) {
    const ok = !demo.accept || demo.accept.includes(moveKey(engine, m));
    setSt(engine.makeMove(st, m));
    setLast(m);
    setSelected(null);
    setChoice(null);
    setMsg(ok ? 'done' : 'other');
  }

  function reset() {
    setSt(start);
    setSelected(null);
    setMsg('task');
    setLast(null);
  }

  const hand = demo.hands && Object.entries(st.hands[me]).filter(([, n]) => n > 0);
  return (
    <div className="rule-demo">
      <div className={`status ${msg === 'done' ? 'over' : ''}`}>
        <span className="status-text">
          {msg === 'done' ? tx(demo.done) : msg === 'other' ? t('這步也合法，但不是這次的任務。按「重來」再試一次。', 'That move is legal, but it is not the task. Tap Retry.') : tx(demo.task)}
        </span>
      </div>
      {hand && hand.length > 0 && msg !== 'done' && (
        <div className="hand active">
          {hand.map(([type, n]) => (
            <button key={type} className={`hand-piece ${selected && 'drop' in selected && selected.drop === type ? 'selected' : ''}`}
              onClick={() => setSelected({ drop: type })}>
              <PieceIcon def={variant.pieces[type]} side={me} colors={variant.sideColors} size={34} />
              {n > 1 && <span className="count">×{n}</span>}
            </button>
          ))}
        </div>
      )}
      <BoardView variant={variant} board={st.board} selected={selected && 'sq' in selected ? selected.sq : undefined}
        targets={targets} lastMove={last && last.from >= 0 ? [last.from, last.to] : undefined} onCell={onCell} />
      {choice && (
        <div className="promo-list">
          {choice.map((m, i) => (
            <button key={i} onClick={() => play(m)}>
              <PieceIcon def={variant.pieces[m.promo ?? m.type]} side={me} colors={variant.sideColors} size={40} />
              <span className="small">{m.promo ? pName(variant.pieces[m.promo]) : t('不升變', 'No promotion')}</span>
            </button>
          ))}
        </div>
      )}
      <div className="btns"><button onClick={reset}>↺ {t('重來', 'Retry')}</button></div>
    </div>
  );
}
