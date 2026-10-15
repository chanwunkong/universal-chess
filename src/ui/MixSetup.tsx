import { useMemo, useState } from 'react';
import { Engine } from '../engine/engine';
import type { RulesDef, Side, VariantDef } from '../engine/types';
import { LangToggle, useLang } from '../i18n';
import { ARMY_SOURCES, BOARD_SOURCES, buildMix, checkMix, placeArmy } from '../mix/build';
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

export function MixSetup({ onBack, onPlay, onSave }: Props) {
  const { t, tx, vName } = useLang();
  const [board, setBoard] = useState('xiangqi');
  const [armies, setArmies] = useState<[string, string]>(['chess', 'xiangqi']);
  const [rules, setRules] = useState<RulesDef>(() => ({ ...preset('chess').rules }));
  const [ruleFrom, setRuleFrom] = useState('chess');
  const [saved, setSaved] = useState(false);

  const cfg = { board, armies, rules };
  const { errors, warnings } = useMemo(() => checkMix(cfg), [board, armies, rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const variant = useMemo(() => buildMix(cfg), [board, armies, rules]); // eslint-disable-line react-hooks/exhaustive-deps
  const startBoard = useMemo(() => (variant ? new Engine(variant).initialState().board : null), [variant]);

  const upd = (patch: Partial<RulesDef>) => { setRules(r => ({ ...r, ...patch })); setSaved(false); };
  const card = (id: string) => RULES.find(r => r.id === id)!;
  const fits = (armyId: string, side: Side) => !placeArmy(armyId, side, preset(board).board).problem;

  function applyRules(id: string) {
    const r = { ...preset(id).rules };
    // 緬甸軍隊要從手上佈陣
    if (armies.includes('sittuyin')) Object.assign(r, { drops: true, mustDrop: true, dropZone: r.dropZone || 3 });
    setRules(r);
    setRuleFrom(id);
    setSaved(false);
  }

  function chooseArmy(side: Side, id: string) {
    const next = [...armies] as [string, string];
    next[side] = id;
    setArmies(next);
    setSaved(false);
    if (id === 'sittuyin') setRules(r => ({ ...r, drops: true, mustDrop: true, dropZone: r.dropZone || 3 }));
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
  const fide = !!rules.repetitionClaim;

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
            <button key={id} className={board === id ? 'selected' : ''} onClick={() => { setBoard(id); setSaved(false); }}>
              <strong>{vName(v)}</strong>
              <span className="muted small">{v.board.width}×{v.board.height}{v.board.cell === 'intersection' ? t('・交叉點', ' · points') : ''}{v.board.palaces ? t('・九宮', ' · palaces') : ''}{v.board.river ? t('・河界', ' · river') : ''}</span>
            </button>
          );
        })}
      </div>

      {([0, 1] as Side[]).map(s => (
        <div key={s}>
          <h3>{s === 0 ? t('2. 先手的軍隊', '2. First player’s army') : t('3. 後手的軍隊', '3. Second player’s army')}</h3>
          <div className="mix-options">
            {ARMY_SOURCES.map(id => {
              const v = preset(id);
              const ok = fits(id, s);
              const king = Object.values(v.pieces).find(p => p.royal);
              return (
                <button key={id} disabled={!ok} className={armies[s] === id ? 'selected' : ''} onClick={() => chooseArmy(s, id)}>
                  <PieceIcon def={king} side={s} colors={v.sideColors} size={30} />
                  <span className="small">{vName(v)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <h3>{t('4. 規則', '4. Rules')}</h3>
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
      {toggle(fide, b => upd({ repetitionClaim: b ? 3 : undefined, moveLimitClaim: b ? 100 : undefined }), 'draw.fide', t('（可要求和棋）', '(claims)'))}
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

      <h3>{t('5. 預覽', '5. Preview')}</h3>
      {variant && startBoard ? (
        <div className="mix-preview"><BoardView variant={variant} board={startBoard} /></div>
      ) : <p className="muted">{t('這個組合放不下，請換棋盤或軍隊。', 'This combination does not fit; choose another board or army.')}</p>}

      <nav className="actionbar">
        <button onClick={() => { if (variant) { onSave(variant); setSaved(true); } }} disabled={!variant || errors.length > 0}>
          <i>💾</i>{saved ? t('已儲存', 'Saved') : t('存成自訂', 'Save')}
        </button>
        <button className="primary" onClick={() => variant && onPlay(variant)} disabled={!variant || errors.length > 0}>
          <i>▶</i>{t('開始對局', 'Play')}
        </button>
      </nav>
    </div>
  );
}
