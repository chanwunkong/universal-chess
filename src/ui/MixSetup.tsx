import { useMemo, useState } from 'react';
import type { RulesDef, Side, VariantDef } from '../engine/types';
import { LangToggle, useLang } from '../i18n';
import {
  ARMY_SOURCES, BOARD_SOURCES, PIECE_LIBRARY, armyFromBase, boardOf, buildMix, campDepth, checkMix, effectiveArmies,
  rankToY, yToRank, type MixArmy, type MixConfig,
} from '../mix/build';
import { RULES } from '../rules/catalog';
import { PRESETS } from '../variants/presets';
import { BoardView } from './BoardView';
import { PieceIcon } from './PieceGlyph';

interface Props {
  onBack: () => void;
  onPlay: (v: VariantDef) => void;
  onSave: (v: VariantDef) => void;
}

const preset = (id: string) => PRESETS.find(v => v.id === id)!;
type Mode = 'replace' | 'free';

/** 棋子庫選擇器：先選棋種，再選棋子 */
function PiecePicker({ side, value, onPick, eraser }: { side: Side; value?: string | null; onPick: (t: string | null) => void; eraser?: boolean }) {
  const { t, vName, pName } = useLang();
  const [group, setGroup] = useState(() => (value && PIECE_LIBRARY[value] ? PIECE_LIBRARY[value].from.id : PRESETS[0].id));
  const v = preset(group);
  return (
    <div className="picker">
      <div className="cat-chips">
        {PRESETS.map(p => <button key={p.id} className={group === p.id ? 'on' : ''} onClick={() => setGroup(p.id)}>{vName(p)}</button>)}
      </div>
      <div className="picker-grid">
        {eraser && (
          <button className={value === null ? 'selected' : ''} onClick={() => onPick(null)} title={t('橡皮擦', 'Eraser')}>
            <span className="eraser">🧽</span><span className="small">{t('移除', 'Remove')}</span>
          </button>
        )}
        {Object.values(v.pieces).map(p => (
          <button key={p.id} className={value === p.id ? 'selected' : ''} onClick={() => onPick(p.id)}>
            <PieceIcon def={p} side={side} colors={v.sideColors} size={36} />
            <span className="small">{pName(p)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function MixSetup({ onBack, onPlay, onSave }: Props) {
  const { t, tx, vName, pName } = useLang();
  const [board, setBoard] = useState('xiangqi');
  const [armies, setArmies] = useState<[MixArmy, MixArmy]>(() => [
    armyFromBase('chess', 0, boardOf('xiangqi')) as MixArmy, armyFromBase('xiangqi', 1, boardOf('xiangqi')) as MixArmy]);
  const [mirror, setMirror] = useState(false);
  const [rules, setRules] = useState<RulesDef>(() => ({ ...preset('chess').rules }));
  const [ruleFrom, setRuleFrom] = useState('chess');
  const [editSide, setEditSide] = useState<Side>(0);
  const [mode, setMode] = useState<Mode>('replace');
  const [brush, setBrush] = useState<string | null>('c.n');
  const [replacing, setReplacing] = useState<{ x: number; rank: number } | null>(null);
  const [saved, setSaved] = useState(false);

  const B = boardOf(board);
  const cfg: MixConfig = { board, armies, mirror, rules };
  const { errors, warnings } = useMemo(() => checkMix(cfg), [board, armies, mirror, rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const variant = useMemo(() => buildMix(cfg), [board, armies, mirror, rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = effectiveArmies(cfg);
  const side: Side = mirror ? 0 : editSide;

  // 預覽用的棋盤：直接由軍隊擺放產生（即使有錯誤也顯示）
  const previewBoard = useMemo(() => {
    const b: VariantDef['setup'] = [];
    shown.forEach((a, s) => a.pieces.forEach(p => b.push({ type: p.type, side: s as Side, x: p.x, y: rankToY(p.rank, s as Side, B) })));
    const arr = new Array(B.width * B.height).fill(null);
    for (const p of b) if (p.x >= 0 && p.x < B.width && p.y >= 0 && p.y < B.height) arr[p.y * B.width + p.x] = { type: p.type, side: p.side };
    return arr;
  }, [shown, B]);
  const previewVariant: VariantDef = variant ?? {
    ...preset(board), pieces: Object.fromEntries(Object.entries(PIECE_LIBRARY).map(([k, v]) => [k, v.def])),
  };
  const zone = useMemo(() => {
    const z: number[] = [];
    for (let r = 0; r < campDepth(B); r++) for (let x = 0; x < B.width; x++) z.push(rankToY(r, side, B) * B.width + x);
    return z;
  }, [B, side]);

  const touch = () => setSaved(false);
  const upd = (patch: Partial<RulesDef>) => { setRules(r => ({ ...r, ...patch })); touch(); };
  const card = (id: string) => RULES.find(r => r.id === id)!;
  const fits = (id: string, s: Side) => !('problem' in armyFromBase(id, s, B));

  function setArmy(s: Side, a: MixArmy) {
    setArmies(prev => {
      const next = [...prev] as [MixArmy, MixArmy];
      next[s] = a;
      return next;
    });
    touch();
  }

  function chooseBoard(id: string) {
    const nb = boardOf(id);
    setBoard(id);
    // 換棋盤時，雙方回到各自底軍隊的擺法；放不下就換成西洋棋軍
    const pick = (s: Side) => {
      const a = armyFromBase(armies[s].base, s, nb);
      return 'problem' in a ? (armyFromBase('chess', s, nb) as MixArmy) : a;
    };
    setArmies([pick(0), pick(1)]);
    touch();
  }

  function chooseBase(s: Side, id: string) {
    const a = armyFromBase(id, s, B);
    if ('problem' in a) return;
    setArmy(s, a);
    if (Object.keys(a.hands).length) setRules(r => ({ ...r, drops: true, mustDrop: true, dropZone: r.dropZone || 3 }));
  }

  function applyRules(id: string) {
    const r = { ...preset(id).rules };
    if (shown.some(a => Object.keys(a.hands).length)) Object.assign(r, { drops: true, mustDrop: true, dropZone: r.dropZone || 3 });
    setRules(r);
    setRuleFrom(id);
    touch();
  }

  function onCell(sq: number) {
    const x = sq % B.width, y = Math.floor(sq / B.width);
    const rank = yToRank(y, side, B);
    if (rank >= campDepth(B)) return;
    const army = armies[side];
    const here = army.pieces.find(p => p.x === x && p.rank === rank);
    if (mode === 'replace') {
      if (here) setReplacing({ x, rank });
      return;
    }
    const rest = army.pieces.filter(p => !(p.x === x && p.rank === rank));
    if (brush === null || (here && here.type === brush)) setArmy(side, { ...army, pieces: rest });
    else setArmy(side, { ...army, pieces: [...rest, { type: brush, x, rank }] });
  }

  function replaceWith(type: string | null) {
    if (!replacing) return;
    const army = armies[side];
    const rest = army.pieces.filter(p => !(p.x === replacing.x && p.rank === replacing.rank));
    setArmy(side, { ...army, pieces: type ? [...rest, { type, ...replacing }] : rest });
    setReplacing(null);
  }

  const toggle = (on: boolean, f: (b: boolean) => void, cardId: string, extra?: string) => (
    <label className="check mix-rule">
      <input type="checkbox" checked={on} onChange={e => f(e.target.checked)} />
      <span>{tx(card(cardId).name)}{extra && <span className="muted small"> {extra}</span>}</span>
    </label>
  );
  const radio = <T extends string>(value: T, options: [T, string][], f: (v: T) => void) => (
    <div className="seg mix-seg">
      {options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => f(v)}>{l}</button>)}
    </div>
  );
  const facing = rules.flyingGeneral ? 'flying' : rules.bikjang ? 'bikjang' : 'none';
  const bare = rules.bareKing ? 'loss' : rules.bareKingDraw ? 'draw' : 'none';
  const sideLabel = (s: Side) => (s === 0 ? t('先手', 'First player') : t('後手', 'Second player'));
  const army = armies[side];
  const royals = army.pieces.filter(p => PIECE_LIBRARY[p.type]?.def.royal).length;
  const replacingPiece = replacing && army.pieces.find(p => p.x === replacing.x && p.rank === replacing.rank);

  return (
    <div className="mix">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <h2>{t('自由組合', 'Mix & match')}</h2>
        <LangToggle />
      </header>

      <h3>{t('1. 棋盤', '1. Board')}</h3>
      <div className="mix-options">
        {BOARD_SOURCES.map(id => {
          const v = preset(id);
          return (
            <button key={id} className={board === id ? 'selected' : ''} onClick={() => chooseBoard(id)}>
              <strong>{vName(v)}</strong>
              <span className="muted small">{v.board.width}×{v.board.height}{v.board.cell === 'intersection' ? t('・交叉點', ' · points') : ''}{v.board.palaces ? t('・九宮', ' · palaces') : ''}{v.board.river ? t('・河界', ' · river') : ''}</span>
            </button>
          );
        })}
      </div>

      <h3>{t('2. 編隊', '2. Armies')}</h3>
      <label className="check">
        <input type="checkbox" checked={mirror} onChange={e => {
          // 關掉鏡像時，後手從目前鏡像的結果開始各自編
          if (!e.target.checked) setArmies(effectiveArmies(cfg));
          setMirror(e.target.checked);
          setEditSide(0);
          touch();
        }} />
        {t('雙方使用相同的軍隊（鏡像）', 'Both sides use the same army (mirror)')}
      </label>
      {!mirror && (
        <div className="seg mix-seg">
          {([0, 1] as Side[]).map(s => <button key={s} className={editSide === s ? 'on' : ''} onClick={() => setEditSide(s)}>{t(`編輯${sideLabel(s)}`, `Edit ${sideLabel(s)}`)}</button>)}
        </div>
      )}

      <p className="small muted">{t(`${mirror ? '' : sideLabel(side)}以哪支軍隊為底（會重設這一方的擺法）`, `${mirror ? 'Base' : `${sideLabel(side)}: base`} army (resets this side)`)}</p>
      <div className="mix-options compact">
        {ARMY_SOURCES.map(id => {
          const v = preset(id);
          const king = Object.values(v.pieces).find(p => p.royal);
          return (
            <button key={id} disabled={!fits(id, side)} className={army.base === id ? 'selected' : ''} onClick={() => chooseBase(side, id)}>
              <PieceIcon def={king} side={side} colors={v.sideColors} size={26} />
              <span className="small">{vName(v)}</span>
            </button>
          );
        })}
      </div>

      <div className="seg mix-seg">
        <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>{t('替換棋子', 'Swap pieces')}</button>
        <button className={mode === 'free' ? 'on' : ''} onClick={() => setMode('free')}>{t('自由擺放', 'Free placement')}</button>
      </div>
      <p className="small muted">
        {mode === 'replace'
          ? t('點己方的棋子，從棋子庫選一種換上去。', 'Tap one of your pieces and pick a replacement from the library.')
          : t('從下方選一種棋子，點己方陣地（淡藍色區域）放上去；再點一次同樣的棋子可移除。', 'Pick a piece below, then tap your camp (shaded) to place it; tap the same piece again to remove it.')}
      </p>
      <div className="mix-preview">
        <BoardView variant={previewVariant} board={previewBoard} camp={zone} onCell={onCell} />
      </div>
      <div className="row army-summary">
        <span className="muted small">{t(`${army.pieces.length} 枚棋子・${royals} 個王`, `${army.pieces.length} pieces · ${royals} king(s)`)}</span>
        <button className="small-btn" onClick={() => chooseBase(side, army.base)}>↺ {t('恢復成底的擺法', 'Reset to base')}</button>
      </div>
      {mode === 'free' && <PiecePicker side={side} value={brush} onPick={setBrush} eraser />}

      <h3>{t('3. 規則', '3. Rules')}</h3>
      <div className="row">
        <span>{t('套用整套規則', 'Use the rules of')}</span>
        <select value={ruleFrom} onChange={e => applyRules(e.target.value)}>
          {PRESETS.map(p => <option key={p.id} value={p.id}>{vName(p)}</option>)}
        </select>
      </div>
      <p className="muted small">{t('以下每一項都對應規則圖鑑裡的一張規則卡，可以自由增減。', 'Each option below is a card in the rule encyclopedia; mix them freely.')}</p>

      <h4>{t('勝負', 'Winning')}</h4>
      {radio(rules.win, [['checkmate', t('將死', 'Checkmate')], ['captureRoyal', t('吃王', 'Capture king')], ['captureAll', t('吃光', 'Capture all')]], v => upd({ win: v }))}
      <p className="small muted">{tx(card('win.stalemate').name)}</p>
      {radio(rules.stalemate, [['draw', t('和棋', 'Draw')], ['loss', t('困斃方輸', 'Stalemated loses')], ['win', t('困斃方贏', 'Stalemated wins')]], v => upd({ stalemate: v }))}
      <p className="small muted">{t('雙王在同一直線照面', 'Kings facing on an open file')}</p>
      {radio(facing, [['none', t('沒有限制', 'No rule')], ['flying', tx(card('win.flyingGeneral').name)], ['bikjang', tx(card('win.bikjang').name)]],
        v => upd({ flyingGeneral: v === 'flying' || undefined, bikjang: v === 'bikjang' || undefined }))}
      <p className="small muted">{tx(card('win.bareKing').name)}</p>
      {radio(bare, [['none', t('沒有特別規則', 'No rule')], ['loss', t('光王判負', 'Bare king loses')], ['draw', t('光王和棋', 'Bare king draws')]],
        v => upd({ bareKing: v === 'loss' || undefined, bareKingDraw: v === 'draw' || undefined }))}

      <h4>{t('走法', 'Moves')}</h4>
      {toggle(!!rules.drops, b => upd({ drops: b || undefined }), 'drop.basic')}
      {toggle(!!rules.mustDrop, b => upd({ mustDrop: b || undefined, dropZone: b ? rules.dropZone || 3 : undefined }), 'drop.deploy')}
      {toggle(!!rules.castling, b => upd({ castling: b || undefined }), 'special.castling')}
      {toggle(!!rules.allowPass, b => upd({ allowPass: b || undefined }), 'special.pass')}
      <label className="row"><span>{tx(card('board.promoZone').name)}</span>
        <select value={rules.promoZoneOverride ?? 0} onChange={e => upd({ promoZoneOverride: Number(e.target.value) || undefined })}>
          {[0, 1, 2, 3].map(n => <option key={n} value={n}>{n === 0 ? t('依各棋子原本的設定', 'Each piece’s own') : t(`最後 ${n} 排`, `Last ${n} rank(s)`)}</option>)}
        </select>
      </label>

      <h4>{t('和局與裁決', 'Draws & rulings')}</h4>
      <label className="row"><span>{t('重複局面', 'Repetition')}</span>
        <select value={rules.repetition} onChange={e => upd({ repetition: Number(e.target.value) })}>
          <option value={0}>{t('不判定', 'Ignored')}</option>
          {[3, 4, 5].map(n => <option key={n} value={n}>{t(`出現 ${n} 次`, `${n} times`)}</option>)}
        </select>
      </label>
      {toggle(!!rules.repetitionClaim, b => upd({ repetitionClaim: b ? 3 : undefined, moveLimitClaim: b ? 100 : undefined }), 'draw.fide', t('（可要求和棋）', '(claims)'))}
      {toggle(!!rules.perpetualCheckLoses, b => upd({ perpetualCheckLoses: b || undefined }), 'draw.perpetualCheck')}
      {toggle(rules.chasing === 'axf', b => upd({ chasing: b ? 'axf' : undefined }), 'draw.chase')}
      <label className="row"><span>{t('無吃子回合上限', 'No-capture limit')}</span>
        <select value={rules.moveLimit} onChange={e => upd({ moveLimit: Number(e.target.value) })}>
          <option value={0}>{t('沒有', 'None')}</option>
          {[100, 150].map(n => <option key={n} value={n}>{t(`${n / 2} 回合`, `${n / 2} moves`)}</option>)}
        </select>
      </label>
      {toggle(!!rules.deadPosition, b => upd({ deadPosition: b || undefined }), 'draw.fide', t('（子力不足和棋）', '(dead position)'))}
      <label className="row"><span>{tx(card('draw.counting').name)}</span>
        <select value={rules.counting ?? ''} onChange={e => upd({ counting: (e.target.value || undefined) as RulesDef['counting'] })}>
          <option value="">{t('不使用', 'None')}</option>
          <option value="makruk">{t('泰國', 'Makruk')}</option>
          <option value="cambodian">{t('柬埔寨', 'Ouk Chatrang')}</option>
          <option value="asean">{t('緬甸', 'Sittuyin')}</option>
        </select>
      </label>
      {toggle(!!rules.pointsAdjudication, b => upd({ pointsAdjudication: b ? { bonus: [0, 1.5] } : undefined }), 'draw.points')}
      {toggle(rules.impasse === 'jsa', b => upd({ impasse: b ? 'jsa' : undefined, maxPlies: b ? 500 : undefined }), 'draw.jishogi')}

      {(errors.length > 0 || warnings.length > 0) && (
        <ul className="warnings">
          {errors.map((e, i) => <li key={`e${i}`}><strong>{tx(e)}</strong></li>)}
          {warnings.map((w, i) => <li key={`w${i}`}>{tx(w)}</li>)}
        </ul>
      )}

      <nav className="actionbar">
        <button onClick={() => { if (variant) { onSave(variant); setSaved(true); } }} disabled={!variant || errors.length > 0}>
          <i>💾</i>{saved ? t('已儲存', 'Saved') : t('存成自訂', 'Save')}
        </button>
        <button className="primary" onClick={() => variant && onPlay(variant)} disabled={!variant || errors.length > 0}>
          <i>▶</i>{t('開始對局', 'Play')}
        </button>
      </nav>

      {replacing && replacingPiece && (
        <div className="modal-bg" onClick={() => setReplacing(null)}>
          <div className="modal sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <PieceIcon def={PIECE_LIBRARY[replacingPiece.type]?.def} side={side} colors={PIECE_LIBRARY[replacingPiece.type]?.from.sideColors ?? ['#fff', '#000']} size={36} />
              <h3>{t(`把「${pName(PIECE_LIBRARY[replacingPiece.type]?.def)}」換成…`, `Replace ${pName(PIECE_LIBRARY[replacingPiece.type]?.def)} with…`)}</h3>
              <button className="ghost" onClick={() => setReplacing(null)}>{t('取消', 'Cancel')}</button>
            </div>
            <PiecePicker side={side} value={replacingPiece.type} onPick={replaceWith} eraser />
          </div>
        </div>
      )}
    </div>
  );
}
