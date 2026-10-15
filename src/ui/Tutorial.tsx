import { useMemo, useState, type ReactNode } from 'react';
import { Engine } from '../engine/engine';
import type { GameState, Move, Side, VariantDef } from '../engine/types';
import { LangToggle, useLang } from '../i18n';
import { describePiece } from '../tutorial/describe';
import { loadProgress, pieceLessons, puzzleLessons, saveStars, soloMoves, soloState, type Lesson, type PieceLesson, type PuzzleLesson } from '../tutorial/lessons';
import { BoardView } from './BoardView';
import { PieceIcon } from './PieceGlyph';

const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

interface Props {
  variant: VariantDef;
  onBack: () => void;
  onPlayAI: () => void;
}

export function Tutorial({ variant, onBack, onPlayAI }: Props) {
  const { t, vName, pName } = useLang();
  const pieces = useMemo(() => pieceLessons(variant), [variant]);
  const puzzles = useMemo(() => puzzleLessons(variant), [variant]);
  const all: Lesson[] = useMemo(() => [...pieces, ...puzzles], [pieces, puzzles]);
  const [progress, setProgress] = useState(loadProgress);
  const [current, setCurrent] = useState<number | null>(null);

  const earned = all.reduce((a, l) => a + (progress[l.id] ?? 0), 0);
  const finish = (id: string, stars: number) => {
    saveStars(id, stars);
    setProgress(loadProgress());
  };

  if (current !== null) {
    const lesson = all[current];
    const common = {
      variant,
      onBack: () => setCurrent(null),
      onNext: current + 1 < all.length ? () => setCurrent(current + 1) : undefined,
      onDone: (stars: number) => finish(lesson.id, stars),
      index: current,
    };
    return lesson.kind === 'piece'
      ? <PieceLessonView key={lesson.id} lesson={lesson} {...common} />
      : <PuzzleView key={lesson.id} lesson={lesson} number={current - pieces.length + 1} {...common} />;
  }

  return (
    <div className="tutorial">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{t(`${vName(variant)}教學`, `Learn ${vName(variant)}`)}</h2>
        <LangToggle />
      </header>
      <div className="progress-row">
        <div className="progress-bar"><span style={{ width: `${(earned / (all.length * 3)) * 100}%` }} /></div>
        <span className="muted small">★ {earned} / {all.length * 3}</span>
      </div>

      <h3>{t('1. 棋子怎麼走', '1. How the pieces move')}</h3>
      <p className="muted small">{t('每關只有一枚棋子，用最少步數走到所有星星。', 'One piece per lesson: reach every star in as few moves as possible.')}</p>
      <div className="lesson-grid">
        {pieces.map((l, i) => (
          <button key={l.id} className="lesson-btn" onClick={() => setCurrent(i)}>
            <PieceIcon def={variant.pieces[l.piece]} side={0} colors={variant.sideColors} size={40} />
            <span className="lesson-name">{pName(variant.pieces[l.piece])}</span>
            <span className="lesson-stars">{starText(progress[l.id] ?? 0)}</span>
          </button>
        ))}
      </div>

      <h3>{t('2. 一步殺謎題', '2. Mate in one')}</h3>
      <p className="muted small">{t('找出唯一能將死對方的那一步。答案由規則引擎檢查。', 'Find the only move that checkmates. The rules engine checks your answer.')}</p>
      <div className="lesson-grid">
        {puzzles.map((l, i) => (
          <button key={l.id} className="lesson-btn" onClick={() => setCurrent(pieces.length + i)}>
            <span className="lesson-num">{i + 1}</span>
            <span className="lesson-stars">{starText(progress[l.id] ?? 0)}</span>
          </button>
        ))}
      </div>

      <h3>{t('3. 實戰', '3. Play')}</h3>
      <button className="primary" onClick={onPlayAI}>{t('和電腦下一局（簡單）', 'Play the computer (easy)')}</button>
    </div>
  );
}

interface LessonProps {
  variant: VariantDef;
  index: number;
  onBack: () => void;
  onNext?: () => void;
  onDone: (stars: number) => void;
}

function LessonShell({ title, children, onBack }: { title: string; children: ReactNode; onBack: () => void }) {
  const { t } = useLang();
  return (
    <div className="lesson">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{title}</h2>
        <LangToggle />
      </header>
      {children}
    </div>
  );
}

function PieceLessonView({ lesson, variant, onBack, onNext, onDone }: LessonProps & { lesson: PieceLesson }) {
  const { t, tx, pName } = useLang();
  const engine = useMemo(() => new Engine(variant), [variant]);
  const def = variant.pieces[lesson.piece];
  const fresh = () => soloState(engine, lesson.piece, lesson.start, false, lesson.blockers, lesson.blockerType);
  const [st, setSt] = useState<GameState>(fresh);
  const [sq, setSq] = useState(lesson.start);
  const [left, setLeft] = useState<number[]>(lesson.stars);
  const [moves, setMoves] = useState(0);
  const [earned, setEarned] = useState<number | null>(null);

  const legal = earned === null ? soloMoves(engine, st, sq) : [];
  const targets = new Map<number, 'move' | 'capture'>(legal.map(m => [m.to, 'move']));

  function onCell(to: number) {
    const m = legal.find(x => x.to === to);
    if (!m) return;
    const next = { ...engine.makeMove(st, m), turn: 0 as Side };
    const remaining = left.filter(s => s !== to);
    const n = moves + 1;
    setSt(next);
    setSq(to);
    setLeft(remaining);
    setMoves(n);
    if (!remaining.length) {
      const stars = n <= lesson.optimal ? 3 : n <= lesson.optimal + 2 ? 2 : 1;
      setEarned(stars);
      onDone(stars);
    }
  }

  function reset() {
    setSt(fresh());
    setSq(lesson.start);
    setLeft(lesson.stars);
    setMoves(0);
    setEarned(null);
  }

  return (
    <LessonShell title={pName(def)} onBack={onBack}>
      <ul className="piece-rules">
        {describePiece(def, variant).map((line, i) => <li key={i}>{tx(line)}</li>)}
      </ul>
      <div className="status">
        <span className="status-text">
          {earned !== null
            ? t(`完成！用了 ${moves} 步（最少 ${lesson.optimal} 步）`, `Done in ${moves} moves (best: ${lesson.optimal})`)
            : t(`星星 ${lesson.stars.length - left.length}/${lesson.stars.length}・已走 ${moves} 步・最少 ${lesson.optimal} 步`,
              `Stars ${lesson.stars.length - left.length}/${lesson.stars.length} · ${moves} moves · best ${lesson.optimal}`)}
        </span>
        {earned !== null && <span className="earned">{starText(earned)}</span>}
      </div>
      <div className="lesson-board">
        <BoardView variant={variant} board={st.board} selected={sq} targets={targets} stars={left} onCell={onCell} />
      </div>
      <nav className="actionbar">
        <button onClick={reset}><i>↺</i>{t('重來', 'Retry')}</button>
        {onNext && <button className={earned !== null ? 'primary' : ''} onClick={onNext}><i>→</i>{t('下一關', 'Next')}</button>}
      </nav>
    </LessonShell>
  );
}

function PuzzleView({ lesson, number, variant, onBack, onNext, onDone }: LessonProps & { lesson: PuzzleLesson; number: number }) {
  const { t, side: sideName } = useLang();
  const engine = useMemo(() => new Engine(variant), [variant]);
  const st = lesson.state;
  const me = st.turn;
  const legal = useMemo(() => engine.legalMoves(st), [engine, st]);
  const isMate = (m: Move) => {
    const next = engine.makeMove(st, m);
    const r = engine.result(next, [st, next]);
    return r.kind === 'win' && r.winner === me && r.reason.zh === '將死';
  };
  const solution = useMemo(() => legal.filter(isMate), [legal]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState<{ sq: number } | { drop: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hintUsed, setHintUsed] = useState(false);
  const [solved, setSolved] = useState<{ state: GameState; move: Move; stars: number } | null>(null);
  const [wrong, setWrong] = useState(false);

  const targets = new Map<number, 'move' | 'capture'>();
  if (selected && !solved) for (const m of legal) {
    if (m.pass) continue;
    if ('sq' in selected ? m.from === selected.sq : m.from < 0 && m.type === selected.drop) targets.set(m.to, m.capture ? 'capture' : 'move');
  }

  function attempt(cands: Move[]) {
    const win = cands.find(isMate);
    if (win) {
      const stars = mistakes === 0 && !hintUsed ? 3 : mistakes <= 1 ? 2 : 1;
      setSolved({ state: engine.makeMove(st, win), move: win, stars });
      onDone(stars);
    } else {
      setMistakes(n => n + 1);
      setWrong(true);
    }
    setSelected(null);
  }

  function onCell(sq: number) {
    if (solved) return;
    setWrong(false);
    if (selected && targets.has(sq)) {
      attempt(legal.filter(m => !m.pass && m.to === sq && ('sq' in selected ? m.from === selected.sq : m.from < 0 && m.type === selected.drop)));
      return;
    }
    const p = st.board[sq];
    setSelected(p && p.side === me ? { sq } : null);
  }

  const hand = (s: Side) => {
    if (!variant.rules.drops) return null;
    const entries = Object.entries(st.hands[s]).filter(([, n]) => n > 0);
    if (!entries.length) return null;
    return (
      <div className={`hand ${s === me ? 'active' : ''}`}>
        {entries.map(([type, n]) => (
          <button key={type} className={`hand-piece ${selected && 'drop' in selected && selected.drop === type ? 'selected' : ''}`}
            disabled={s !== me || !!solved} onClick={() => setSelected({ drop: type })}>
            <PieceIcon def={variant.pieces[type]} side={s} colors={variant.sideColors} size={34} />
            {n > 1 && <span className="count">×{n}</span>}
          </button>
        ))}
      </div>
    );
  };

  const hintSq = hintUsed && !solved && solution[0] && solution[0].from >= 0 ? [solution[0].from] : undefined;
  const shown = solved ? solved.state : st;
  const flipped = me === 1;

  return (
    <LessonShell title={t(`一步殺 ${number}`, `Mate in one #${number}`)} onBack={onBack}>
      <div className={`status ${solved ? 'over' : ''}`}>
        <span className="turn-dot" style={{ background: variant.sideColors[me] }} />
        <span className="status-text">
          {solved ? t('將死！', 'Checkmate!')
            : wrong ? t('這步沒有將死，再試一次。', 'That is not mate. Try again.')
              : t(`${sideName(variant, me)}先走：找出一步將死的走法`, `${sideName(variant, me)} to move and mate in one`)}
        </span>
        {solved && <span className="earned">{starText(solved.stars)}</span>}
      </div>
      <div className="lesson-board">
        {hand(flipped ? 0 : 1)}
        <BoardView variant={variant} board={shown.board} flipped={flipped}
          selected={selected && 'sq' in selected ? selected.sq : undefined} targets={targets}
          lastMove={solved && solved.move.from >= 0 ? [solved.move.from, solved.move.to] : undefined}
          checkSqs={solved ? engine.royals(solved.state, solved.state.turn) : undefined}
          hint={hintSq} onCell={onCell} />
        {hand(flipped ? 1 : 0)}
      </div>
      {hintUsed && !solved && solution[0]?.from === -1 && (
        <p className="muted small">{t('提示：答案是打入。', 'Hint: the answer is a drop.')}</p>
      )}
      <nav className="actionbar">
        {!solved && <button onClick={() => setHintUsed(true)} disabled={hintUsed}><i>?</i>{t('提示', 'Hint')}</button>}
        {onNext && <button className={solved ? 'primary' : ''} onClick={onNext}><i>→</i>{t('下一關', 'Next')}</button>}
      </nav>
    </LessonShell>
  );
}
