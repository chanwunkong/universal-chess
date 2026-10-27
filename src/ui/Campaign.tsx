import { useMemo, useState } from 'react';
import { Engine } from '../engine/engine';
import type { GameState, Move, Result, VariantDef } from '../engine/types';
import { LangToggle, useLang } from '../i18n';
import {
  FLAG, MAX_DEPTH, MAX_W, REWARD, STAGES, STARTS, buildArena, canPlaceTile, loadRecords, loadRun, lostPieces,
  makeOffers, newRun, recordRun, rotate, saveRun, stageInfo, type Cell, type Difficulty, type Offer, type RunState,
} from '../campaign/campaign';
import { PIECE_LIBRARY } from '../mix/build';
import { PRESETS } from '../variants/presets';
import { BoardView } from './BoardView';
import { GameView } from './GameView';
import { PieceIcon } from './PieceGlyph';
import { PieceInfo, peekTargets } from './PieceInfo';

type Phase = 'menu' | 'prep' | 'battle' | 'result';
type Outcome = { kind: 'win' | 'draw' | 'loss' | 'clear'; gained?: number; lost?: string[] };
type Selection = { kind: 'army'; i: number } | { kind: 'bench'; i: number } | { kind: 'tile'; i: number; cells: Cell[] } | null;

const ALL_PIECES = { flag: FLAG, ...Object.fromEntries(Object.entries(PIECE_LIBRARY).map(([k, v]) => [k, v.def])) };
const pieceDef = (t: string) => (t === 'flag' ? FLAG : PIECE_LIBRARY[t]?.def);
const colorsOf = (start: string): [string, string] => PRESETS.find(v => v.id === start)!.sideColors;

export function Campaign({ onBack }: { onBack: () => void }) {
  const { t, tx, vName, pName } = useLang();
  const [run, setRunState] = useState<RunState | null>(loadRun);
  const [phase, setPhase] = useState<Phase>(run ? 'prep' : 'menu');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [start, setStart] = useState('chess');
  const [sel, setSel] = useState<Selection>(null);
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const [scout, setScout] = useState<number | null>(null);
  const records = loadRecords();

  const setRun = (r: RunState | null) => { setRunState(r); saveRun(r); };
  const stage = useMemo(() => (run ? stageInfo(run) : null), [run]);
  const arena = useMemo(() => (run && stage ? buildArena(run, stage) : null), [run, stage]);

  // ---------------- 選單 ----------------
  if (phase === 'menu' || !run || !stage || !arena) {
    return (
      <div className="campaign">
        <header className="topbar">
          <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
          <h2>{t('無盡征途', 'The Long March')}</h2>
          <LangToggle />
        </header>
        <p className="muted">{t('從一小塊領地出發，三幕共 9 關：奪旗、軍團、最後將死國王。每關之後用戰功擴充領地、招募各國棋子；輸一局就結束整輪。',
          'Start from a tiny territory and fight 9 battles in three acts: capture the flag, face the legions, then checkmate the king. Spend your spoils between battles; one loss ends the run.')}</p>
        <div className="records">
          <span>{t('簡單', 'Easy')}：{t(`最佳第 ${records.easy.best} 關・通關 ${records.easy.clears} 次`, `best stage ${records.easy.best} · cleared ${records.easy.clears}×`)}</span>
          <span>{t('困難', 'Hard')}：{t(`最佳第 ${records.hard.best} 關・通關 ${records.hard.clears} 次`, `best stage ${records.hard.best} · cleared ${records.hard.clears}×`)}</span>
        </div>
        <h3>{t('難度', 'Difficulty')}</h3>
        <div className="seg mix-seg">
          <button className={difficulty === 'easy' ? 'on' : ''} onClick={() => setDifficulty('easy')}>{t('簡單：棋子每關復活', 'Easy: pieces revive')}</button>
          <button className={difficulty === 'hard' ? 'on' : ''} onClick={() => setDifficulty('hard')}>{t('困難：被吃就消失', 'Hard: losses are permanent')}</button>
        </div>
        <h3>{t('起始軍隊', 'Starting army')}</h3>
        <div className="mix-options compact">
          {STARTS.map(s => {
            const v = PRESETS.find(p => p.id === s.id)!;
            return (
              <button key={s.id} className={start === s.id ? 'selected' : ''} onClick={() => setStart(s.id)}>
                <span className="kit">{s.kit.map((k, i) => <PieceIcon key={i} def={pieceDef(k)} side={0} colors={v.sideColors} size={22} />)}</span>
                <span className="small">{vName(v)}</span>
              </button>
            );
          })}
        </div>
        <div className="btns">
          <button className="primary" onClick={() => { const r = newRun(difficulty, start); r.offers = makeOffers(r); setRun(r); setPhase('prep'); }}>
            {t('出發', 'Begin')}
          </button>
        </div>
      </div>
    );
  }

  const colors = colorsOf(run.start);

  // ---------------- 對局 ----------------
  if (phase === 'battle') {
    const finish = (r: Result, history: GameState[], moves: Move[]) => {
      if (r.kind === 'draw') { setOutcome({ kind: 'draw' }); setPhase('result'); return; }
      if (r.kind === 'win' && r.winner === 0) {
        const lost = lostPieces(arena, history[0], moves);
        const gained = REWARD(run.stage);
        if (run.stage + 1 >= STAGES) {
          recordRun(run.difficulty, STAGES, true);
          setRun(null);
          setOutcome({ kind: 'clear', gained });
          setPhase('result');
          return;
        }
        const army = run.difficulty === 'hard' ? run.army.filter((_, i) => !lost.includes(i) || run.army[i].type === 'flag') : run.army;
        const next: RunState = { ...run, stage: run.stage + 1, points: run.points + gained, army };
        next.offers = makeOffers(next);
        recordRun(run.difficulty, run.stage + 1, false);
        setRun(next);
        setOutcome({ kind: 'win', gained, lost: run.difficulty === 'hard' ? lost.map(i => run.army[i].type) : [] });
        setPhase('result');
        return;
      }
      recordRun(run.difficulty, run.stage, false);
      setRun(null);
      setOutcome({ kind: 'loss' });
      setPhase('result');
    };
    return <GameView variant={arena.variant} onBack={() => setPhase('prep')} campaign={{ level: stage.ai, onFinish: finish }} />;
  }

  // ---------------- 結果 ----------------
  if (phase === 'result' && outcome) {
    const titles = {
      win: t('勝利！', 'Victory!'), draw: t('和局：重打這一關', 'Draw: replay this battle'),
      loss: t('戰敗', 'Defeated'), clear: t('征途完成！', 'Campaign complete!'),
    };
    return (
      <div className="campaign result">
        <h2>{titles[outcome.kind]}</h2>
        {outcome.gained !== undefined && <p>{t(`獲得戰功 ${outcome.gained} 點。`, `You earned ${outcome.gained} spoils.`)}</p>}
        {!!outcome.lost?.length && (
          <p>{t('在這一戰永久失去：', 'Lost for good: ')}{outcome.lost.map(x => pName(pieceDef(x))).join('、')}</p>
        )}
        {outcome.kind === 'loss' && <p className="muted">{t('這一輪結束了。成績已記錄。', 'This run is over. Your result has been recorded.')}</p>}
        {outcome.kind === 'clear' && <p>{t('你打倒了國王，完成整趟征途。', 'You toppled the king and completed the march.')}</p>}
        <div className="btns">
          {(outcome.kind === 'win' || outcome.kind === 'draw') && <button className="primary" onClick={() => setPhase('prep')}>{t('繼續', 'Continue')}</button>}
          {(outcome.kind === 'loss' || outcome.kind === 'clear') && <button className="primary" onClick={() => setPhase('menu')}>{t('回到選單', 'Back to menu')}</button>}
        </div>
      </div>
    );
  }

  // ---------------- 整備 ----------------
  const scoutEngine = new Engine(arena.variant);
  const scoutState = scoutEngine.initialState();
  const yOf = (r: number) => MAX_DEPTH - 1 - r;
  const own = new Set(run.territory.map(([x, r]) => `${x},${r}`));
  const occupied = new Map(run.army.map((p, i) => [`${p.x},${p.r}`, i]));
  const editVariant: VariantDef = {
    ...PRESETS[0], id: 'campaign-edit', board: { width: MAX_W, height: MAX_DEPTH, cell: 'square', checkered: false },
    pieces: ALL_PIECES, rules: { ...PRESETS[0].rules, promotionZone: 0 }, sideColors: colors,
  };
  const editBoard = new Array(MAX_W * MAX_DEPTH).fill(null);
  run.army.forEach(p => { editBoard[yOf(p.r) * MAX_W + p.x] = { type: p.type, side: 0 }; });
  const territorySqs = run.territory.map(([x, r]) => yOf(r) * MAX_W + x);
  const ghost = sel?.kind === 'tile' && anchor ? sel.cells.map(([x, r]) => [x + anchor[0], r + anchor[1]] as Cell) : [];
  const ghostOk = sel?.kind === 'tile' && anchor ? canPlaceTile(run.territory, sel.cells, anchor[0], anchor[1]) : false;
  const ghostSqs = ghost.filter(([x, r]) => x >= 0 && x < MAX_W && r >= 0 && r < MAX_DEPTH).map(([x, r]) => yOf(r) * MAX_W + x);

  function onCell(sq: number) {
    if (!run) return;
    const x = sq % MAX_W, r = MAX_DEPTH - 1 - Math.floor(sq / MAX_W);
    if (sel?.kind === 'tile') { setAnchor([x, r]); return; }
    const key = `${x},${r}`;
    const here = occupied.get(key);
    if (sel?.kind === 'bench' && own.has(key) && here === undefined) {
      const bench = run.bench.filter((_, i) => i !== sel.i);
      setRun({ ...run, bench, army: [...run.army, { type: run.bench[sel.i], x, r }] });
      setSel(null);
      return;
    }
    if (sel?.kind === 'army' && own.has(key) && here === undefined) {
      setRun({ ...run, army: run.army.map((p, i) => (i === sel.i ? { ...p, x, r } : p)) });
      setSel(null);
      return;
    }
    setSel(here !== undefined && !(sel?.kind === 'army' && sel.i === here) ? { kind: 'army', i: here } : null);
  }

  function placeTile() {
    if (!run || sel?.kind !== 'tile' || !anchor || !ghostOk) return;
    setRun({ ...run, territory: [...run.territory, ...ghost], tiles: run.tiles.filter((_, i) => i !== sel.i) });
    setSel(null);
    setAnchor(null);
  }

  function buy(o: Offer, idx: number) {
    if (!run || run.points < o.cost) return;
    const offers = run.offers.filter((_, i) => i !== idx);
    const points = run.points - o.cost;
    if (o.kind === 'piece') setRun({ ...run, points, offers, bench: [...run.bench, o.type] });
    else if (o.kind === 'tile') setRun({ ...run, points, offers, tiles: [...run.tiles, o.cells] });
    else {
      const i = run.army.findIndex(p => p.type === o.from);
      if (i < 0) return;
      setRun({ ...run, points, offers, army: run.army.map((p, j) => (j === i ? { ...p, type: o.to } : p)) });
    }
  }

  function toBench() {
    if (!run || sel?.kind !== 'army' || run.army[sel.i].type === 'flag') return;
    setRun({ ...run, army: run.army.filter((_, i) => i !== sel.i), bench: [...run.bench, run.army[sel.i].type] });
    setSel(null);
  }

  const selected = sel?.kind === 'army' ? yOf(run.army[sel.i].r) * MAX_W + run.army[sel.i].x : undefined;
  const offerLabel = (o: Offer) => o.kind === 'piece' ? pName(pieceDef(o.type))
    : o.kind === 'tile' ? t('擴充方塊', 'Territory tile')
      : t(`升級：${pName(pieceDef(o.from))} → ${pName(pieceDef(o.to))}`, `Upgrade: ${pName(pieceDef(o.from))} → ${pName(pieceDef(o.to))}`);

  return (
    <div className="campaign">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{tx(stage.title)}</h2>
        <LangToggle />
      </header>
      <div className="status">
        <span className="status-text">{tx(stage.goal)}</span>
        <span className="points">★ {run.points}</span>
      </div>
      <p className="muted small">
        {t(`第 ${run.stage + 1}/${STAGES} 關・${run.difficulty === 'easy' ? '簡單' : '困難'}`, `Battle ${run.stage + 1}/${STAGES} · ${run.difficulty === 'easy' ? 'Easy' : 'Hard'}`)}
        {stage.ruleCards.includes('drop.basic') && t('・本關規則：打入', ' · Rule this battle: drops')}
      </p>

      <h3>{t('敵情', 'Battlefield')}</h3>
      <PieceInfo variant={arena.variant} piece={scout !== null && scoutState.board[scout] ? { type: scoutState.board[scout]!.type, side: scoutState.board[scout]!.side } : null} onClose={() => setScout(null)} />
      <div className="mix-preview">
        <BoardView variant={arena.variant} board={scoutState.board}
          peek={scout !== null && scoutState.board[scout] ? { sq: scout, targets: peekTargets(scoutEngine, scoutState, scout) } : undefined}
          onCell={sq => setScout(scoutState.board[sq] && scout !== sq ? sq : null)} />
      </div>

      <h3>{t('商店', 'Shop')}</h3>
      <div className="shop">
        {run.offers.map((o, i) => (
          <button key={i} disabled={run.points < o.cost} onClick={() => buy(o, i)}>
            {o.kind === 'tile'
              ? <span className="tile-mini">{tileGrid(o.cells)}</span>
              : <PieceIcon def={pieceDef(o.kind === 'piece' ? o.type : o.to)} side={0} colors={colors} size={34} />}
            <span className="small">{offerLabel(o)}</span>
            <span className="cost">★ {o.cost}</span>
          </button>
        ))}
        {!run.offers.length && <p className="muted small">{t('商品已售完。', 'Sold out.')}</p>}
      </div>

      <h3>{t('你的領地', 'Your territory')}</h3>
      <p className="muted small">{t('藍色格子是你的領地。點棋子再點空格可以移動；備用的棋子點選後放進領地；擴充方塊選好後點棋盤預覽，可旋轉後放置。',
        'Blue squares are your territory. Tap a piece, then an empty square to move it; tap a reserve piece to place it; pick a tile, tap the board to preview, rotate, then place.')}</p>
      <div className="mix-preview">
        <BoardView variant={editVariant} board={editBoard} camp={territorySqs} selected={selected}
          hint={ghostOk ? ghostSqs : undefined} checkSqs={!ghostOk && ghostSqs.length ? ghostSqs : undefined} onCell={onCell} />
      </div>
      {sel?.kind === 'army' && run.army[sel.i].type !== 'flag' && (
        <div className="btns"><button onClick={toBench}>{t('移到備用區', 'Move to reserve')}</button></div>
      )}
      {sel?.kind === 'tile' && (
        <div className="btns">
          <button onClick={() => setSel({ ...sel, cells: rotate(sel.cells) })}>⟳ {t('旋轉', 'Rotate')}</button>
          <button className="primary" disabled={!ghostOk} onClick={placeTile}>{t('放置', 'Place')}</button>
          <button onClick={() => { setSel(null); setAnchor(null); }}>{t('取消', 'Cancel')}</button>
        </div>
      )}
      {(run.bench.length > 0 || run.tiles.length > 0) && (
        <>
          <h4>{t('備用區', 'Reserve')}</h4>
          <div className="shop">
            {run.bench.map((b, i) => (
              <button key={`b${i}`} className={sel?.kind === 'bench' && sel.i === i ? 'selected' : ''} onClick={() => setSel({ kind: 'bench', i })}>
                <PieceIcon def={pieceDef(b)} side={0} colors={colors} size={34} />
                <span className="small">{pName(pieceDef(b))}</span>
              </button>
            ))}
            {run.tiles.map((c, i) => (
              <button key={`t${i}`} className={sel?.kind === 'tile' && sel.i === i ? 'selected' : ''} onClick={() => { setSel({ kind: 'tile', i, cells: c }); setAnchor(null); }}>
                <span className="tile-mini">{tileGrid(c)}</span>
                <span className="small">{t('擴充方塊', 'Tile')}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <nav className="actionbar">
        <button onClick={() => { if (confirm(t('放棄這一輪？', 'Abandon this run?'))) { recordRun(run.difficulty, run.stage, false); setRun(null); setPhase('menu'); } }}>
          <i>✕</i>{t('放棄', 'Abandon')}
        </button>
        <button className="primary" onClick={() => setPhase('battle')}><i>⚔</i>{t('出征', 'To battle')}</button>
      </nav>
    </div>
  );
}

/** 方塊的小圖示 */
function tileGrid(cells: Cell[]) {
  const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
  const on = new Set(cells.map(([x, r]) => `${x},${r}`));
  return (
    <svg width={w * 10} height={h * 10} viewBox={`0 0 ${w * 10} ${h * 10}`}>
      {Array.from({ length: h }, (_, r) => Array.from({ length: w }, (_, x) =>
        on.has(`${x},${r}`) ? <rect key={`${x},${r}`} x={x * 10 + 0.5} y={r * 10 + 0.5} width={9} height={9} rx={1.5} className="tile-block" /> : null))}
    </svg>
  );
}
