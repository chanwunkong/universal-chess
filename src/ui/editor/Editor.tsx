import { useMemo, useState } from 'react';
import type { PieceDef, Placement, RulesDef, Side, VariantDef } from '../../engine/types';
import { ALL8, PRESETS, pieceLibrary } from '../../variants/presets';
import { clone } from '../../storage';
import { LangToggle, useLang } from '../../i18n';
import { BoardView } from '../BoardView';
import { PieceIcon } from '../PieceGlyph';
import { PieceEditor } from './PieceEditor';

type Tab = 'board' | 'pieces' | 'setup' | 'rules';
type T = (zh: string, en: string) => string;

interface Props {
  initial: VariantDef;
  onSave: (v: VariantDef) => void;
  onPlay: (v: VariantDef) => void;
  onBack: () => void;
}

export function blankFrom(base: VariantDef): VariantDef {
  return {
    ...clone(base), id: 'custom-' + Date.now(),
    name: `自訂：${base.name}`, nameEn: `Custom: ${base.nameEn ?? base.name}`, custom: true,
  };
}

/** 檢查變體能否正常遊玩 */
function validate(v: VariantDef, t: T, pName: (p: PieceDef) => string, side: (s: Side) => string): string[] {
  const w: string[] = [];
  for (const s of [0, 1] as Side[]) {
    const mine = v.setup.filter(p => p.side === s);
    if (!mine.length) w.push(t(`${side(s)}沒有任何棋子。`, `${side(s)} has no pieces.`));
    else if (v.rules.win !== 'captureAll' && !mine.some(p => v.pieces[p.type]?.royal))
      w.push(t(`${side(s)}沒有「王」，無法被將死或吃王；建議勝負條件改為「吃光對方」。`,
        `${side(s)} has no royal piece, so it can never be mated; consider "capture all" as the win condition.`));
  }
  for (const p of Object.values(v.pieces)) {
    if (!p.moves.length || p.moves.every(m => !m.vectors.length)) w.push(t(`「${pName(p)}」沒有任何走法。`, `"${pName(p)}" has no moves.`));
    if (p.moves.some(m => m.confine === 'palace' || m.when === 'palace') && !v.board.palaces?.length)
      w.push(t(`「${pName(p)}」限制在九宮內，但棋盤沒有九宮。`, `"${pName(p)}" is confined to a palace, but the board has none.`));
    if (p.promotesTo?.length && !v.rules.promotionZone)
      w.push(t(`「${pName(p)}」可以升變，但升變區深度為 0。`, `"${pName(p)}" can promote, but the promotion zone is 0 ranks deep.`));
  }
  return w;
}

export function Editor({ initial, onSave, onPlay, onBack }: Props) {
  const { lang, t, vName, pName, side } = useLang();
  const [v, setV] = useState<VariantDef>(() => clone(initial));
  const [tab, setTab] = useState<Tab>('board');
  const [editing, setEditing] = useState<string | null>(null);
  const [showLib, setShowLib] = useState(false);
  const [brush, setBrush] = useState<{ type: string | null; side: Side }>({ type: null, side: 0 });
  const sn = (s: Side) => side(v, s);
  const warnings = useMemo(() => validate(v, t, pName, sn), [v, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (patch: Partial<VariantDef>) => setV(prev => ({ ...prev, ...patch }));
  const updRules = (patch: Partial<RulesDef>) => setV(prev => ({ ...prev, rules: { ...prev.rules, ...patch } }));
  const W = v.board.width, H = v.board.height;
  const en = lang === 'en';

  function resize(width: number, height: number) {
    width = Math.max(3, Math.min(16, width || 3));
    height = Math.max(3, Math.min(16, height || 3));
    setV(prev => ({
      ...prev,
      board: { ...prev.board, width, height },
      setup: prev.setup.filter(p => p.x < width && p.y < height),
    }));
  }

  function addPalaces() {
    const x = Math.floor((W - 3) / 2);
    upd({ board: { ...v.board, palaces: [{ x, y: 0, w: 3, h: 3, side: 0 }, { x, y: H - 3, w: 3, h: 3, side: 1 }] } });
  }

  function addFromLibrary(p: PieceDef) {
    const src = PRESETS.find(pr => pr.pieces[p.id]);
    const pieces = { ...v.pieces };
    // 一併加入相關的升變/降級棋子
    const queue = [p.id];
    while (queue.length) {
      const id = queue.pop()!;
      if (pieces[id] || !src?.pieces[id]) continue;
      pieces[id] = clone(src.pieces[id]);
      queue.push(...(src.pieces[id].promotesTo ?? []));
      if (src.pieces[id].demotesTo) queue.push(src.pieces[id].demotesTo!);
    }
    upd({ pieces });
  }

  function newPiece() {
    const id = 'u.' + Date.now().toString(36);
    upd({
      pieces: {
        ...v.pieces,
        [id]: { id, name: '新棋子', nameEn: 'New piece', labels: ['新', '新'], style: 'disc', moves: [{ vectors: ALL8.map(x => [...x] as [number, number]), range: 1, mode: 'both' }] },
      },
    });
    setEditing(id);
  }

  function deletePiece(id: string) {
    const pieces: Record<string, PieceDef> = {};
    for (const [k, p] of Object.entries(v.pieces)) {
      if (k === id) continue;
      const q = { ...p };
      if (q.promotesTo) q.promotesTo = q.promotesTo.filter(x => x !== id);
      if (q.demotesTo === id) delete q.demotesTo;
      pieces[k] = q;
    }
    const strip = (list?: string[]) => list?.filter(x => x !== id);
    setV(prev => ({
      ...prev, pieces,
      setup: prev.setup.filter(p => p.type !== id),
      rules: { ...prev.rules, noMateBy: strip(prev.rules.noMateBy), mateRequiresCheckBy: strip(prev.rules.mateRequiresCheckBy) },
    }));
  }

  function paint(sq: number) {
    const x = sq % W, y = Math.floor(sq / W);
    const rest = v.setup.filter(p => !(p.x === x && p.y === y));
    const existing = v.setup.find(p => p.x === x && p.y === y);
    const same = existing && existing.type === brush.type && existing.side === brush.side;
    upd({ setup: brush.type && !same ? [...rest, { type: brush.type, side: brush.side, x, y }] : rest });
  }

  function mirror(mode: 'reflect' | 'rotate') {
    const own = v.setup.filter(p => p.side === 0);
    const opp: Placement[] = own.map(p => ({ ...p, side: 1, x: mode === 'rotate' ? W - 1 - p.x : p.x, y: H - 1 - p.y }));
    const occupied = new Set(own.map(p => `${p.x},${p.y}`));
    upd({ setup: [...own, ...opp.filter(p => !occupied.has(`${p.x},${p.y}`))] });
  }

  const board = useMemo(() => {
    const b = new Array(W * H).fill(null);
    for (const p of v.setup) if (p.x < W && p.y < H) b[p.y * W + p.x] = { type: p.type, side: p.side };
    return b;
  }, [v.setup, W, H]);

  const pieceList = Object.values(v.pieces);
  const check = (on: boolean | undefined, f: (b: boolean) => void, label: string) => (
    <label className="check"><input type="checkbox" checked={!!on} onChange={e => f(e.target.checked)} />{label}</label>
  );
  const num = (label: string, value: number | undefined, f: (n: number) => void, extra: { min?: number; max?: number; step?: number } = {}) => (
    <label className="row"><span>{label}</span>
      <input type="number" min={extra.min ?? 0} max={extra.max} step={extra.step} value={value ?? 0} onChange={e => f(Number(e.target.value) || 0)} />
    </label>
  );
  const pieceChecks = (list: string[] | undefined, f: (l: string[] | undefined) => void) => (
    <div className="chips">
      {pieceList.map(p => (
        <label key={p.id} className="chip-check">
          <input type="checkbox" checked={!!list?.includes(p.id)}
            onChange={e => { const n = e.target.checked ? [...(list ?? []), p.id] : (list ?? []).filter(x => x !== p.id); f(n.length ? n : undefined); }} />
          {pName(p)}
        </label>
      ))}
    </div>
  );
  // 目前語言的名稱欄位
  const nameKey = en ? 'nameEn' : 'name';
  const descKey = en ? 'descriptionEn' : 'description';
  const sideNames = en ? v.sideNamesEn ?? v.sideNames : v.sideNames;

  return (
    <div className="editor">
      <header className="editor-head">
        <button className="icon-btn" onClick={onBack} aria-label={t('返回', 'Back')}>‹</button>
        <input className="title-input" value={(en ? v.nameEn : v.name) ?? v.name} onChange={e => upd({ [nameKey]: e.target.value })} />
        <LangToggle />
        <div className="head-actions">
          <label className="row base-select">
            <span className="muted small">{t('套用基礎', 'Start from')}</span>
            <select value="" onChange={e => {
              const base = PRESETS.find(p => p.id === e.target.value);
              if (base && confirm(t(`以「${vName(base)}」取代目前的設定？`, `Replace the current settings with "${vName(base)}"?`))) setV({ ...blankFrom(base), id: v.id });
            }}>
              <option value="">{t('選擇…', 'Choose…')}</option>
              {PRESETS.map(p => <option key={p.id} value={p.id}>{vName(p)}</option>)}
            </select>
          </label>
          <button onClick={() => onSave(v)}>{t('儲存', 'Save')}</button>
          <button className="primary" onClick={() => onPlay(v)}>{t('儲存並試玩', 'Save & play')}</button>
        </div>
      </header>

      <nav className="tabs">
        {([['board', t('棋盤', 'Board')], ['pieces', t(`棋子（${pieceList.length}）`, `Pieces (${pieceList.length})`)], ['setup', t('擺子', 'Setup')], ['rules', t('規則', 'Rules')]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      {warnings.length > 0 && <ul className="warnings">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

      <div className="editor-body">
        <div className="editor-form">
          {tab === 'board' && <>
            <label className="row"><span>{t('說明', 'Description')}</span>
              <input value={(en ? v.descriptionEn : v.description) ?? ''} onChange={e => upd({ [descKey]: e.target.value })} />
            </label>
            <label className="row"><span>{t('寬度', 'Width')}</span><input type="number" min={3} max={16} value={W} onChange={e => resize(Number(e.target.value), H)} /></label>
            <label className="row"><span>{t('高度', 'Height')}</span><input type="number" min={3} max={16} value={H} onChange={e => resize(W, Number(e.target.value))} /></label>
            <label className="row"><span>{t('落子位置', 'Pieces sit')}</span>
              <select value={v.board.cell} onChange={e => upd({ board: { ...v.board, cell: e.target.value as 'square' | 'intersection' } })}>
                <option value="square">{t('格子內（西洋棋、將棋）', 'On squares (chess, shogi)')}</option>
                <option value="intersection">{t('交叉點上（象棋）', 'On intersections (xiangqi)')}</option>
              </select>
            </label>
            {check(v.board.checkered, b => upd({ board: { ...v.board, checkered: b } }), t('黑白相間格子', 'Checkered squares'))}
            {check(v.board.river, b => upd({ board: { ...v.board, river: b } }), t('中間畫河界（僅顯示；「過河」以半場判定）', 'Draw a river (display only; "across the river" means the far half)'))}
            <h4>{t('九宮', 'Palaces')}</h4>
            {(v.board.palaces ?? []).map((p, i) => (
              <div key={i} className="palace-row">
                <span>{sn(p.side)}</span>
                {(['x', 'y', 'w', 'h'] as const).map(k => (
                  <label key={k}>{({ x: t('左', 'Left'), y: t('下', 'Bottom'), w: t('寬', 'W'), h: t('高', 'H') })[k]}
                    <input type="number" min={k === 'w' || k === 'h' ? 1 : 0} value={p[k] + (k === 'x' || k === 'y' ? 1 : 0)}
                      onChange={e => {
                        const palaces = [...v.board.palaces!];
                        palaces[i] = { ...p, [k]: Number(e.target.value) - (k === 'x' || k === 'y' ? 1 : 0) };
                        upd({ board: { ...v.board, palaces } });
                      }} />
                  </label>
                ))}
                <button className="danger small-btn" onClick={() => upd({ board: { ...v.board, palaces: v.board.palaces!.filter((_, j) => j !== i) } })}>✕</button>
              </div>
            ))}
            <button onClick={addPalaces}>{t('自動加入雙方九宮（3×3）', 'Add a 3×3 palace for each side')}</button>
            <h4>{t('雙方', 'Sides')}</h4>
            {([0, 1] as Side[]).map(s => (
              <div key={s} className="row">
                <input value={sideNames[s]} onChange={e => {
                  const n = [...sideNames] as [string, string];
                  n[s] = e.target.value;
                  upd(en ? { sideNamesEn: n } : { sideNames: n });
                }} />
                <input type="color" value={v.sideColors[s]} onChange={e => { const c = [...v.sideColors] as [string, string]; c[s] = e.target.value; upd({ sideColors: c }); }} />
              </div>
            ))}
          </>}

          {tab === 'pieces' && <>
            <div className="btns">
              <button onClick={() => setShowLib(true)}>{t('從棋子庫加入', 'Add from library')}</button>
              <button onClick={newPiece}>{t('＋ 設計新棋子', '+ Design a piece')}</button>
            </div>
            <ul className="piece-list">
              {pieceList.map(p => (
                <li key={p.id}>
                  <PieceIcon def={p} side={0} colors={v.sideColors} size={36} />
                  <PieceIcon def={p} side={1} colors={v.sideColors} size={36} />
                  <span className="grow">{pName(p)}
                    {p.royal && <em className="tag">{t('王', 'Royal')}</em>}
                    {p.promotesTo?.length ? <em className="tag">{t('可升變', 'Promotes')}</em> : null}
                  </span>
                  <button className="small-btn" onClick={() => setEditing(p.id)}>{t('編輯', 'Edit')}</button>
                  <button className="small-btn" onClick={() => {
                    const id = 'u.' + Date.now().toString(36);
                    upd({ pieces: { ...v.pieces, [id]: { ...clone(p), id, name: p.name + '（複製）', nameEn: (p.nameEn ?? p.name) + ' (copy)' } } });
                  }}>{t('複製', 'Copy')}</button>
                  <button className="danger small-btn" onClick={() => deletePiece(p.id)}>{t('刪除', 'Delete')}</button>
                </li>
              ))}
            </ul>
          </>}

          {tab === 'setup' && <>
            <div className="row">
              <span>{t('擺放：', 'Placing:')}</span>
              {([0, 1] as Side[]).map(s => (
                <button key={s} className={brush.side === s ? 'active' : ''} onClick={() => setBrush(b => ({ ...b, side: s }))}>{sn(s)}</button>
              ))}
            </div>
            <div className="palette">
              <button className={brush.type === null ? 'selected' : ''} onClick={() => setBrush(b => ({ ...b, type: null }))} title={t('橡皮擦', 'Eraser')}>🧽</button>
              {pieceList.map(p => (
                <button key={p.id} className={brush.type === p.id ? 'selected' : ''} title={pName(p)}
                  onClick={() => setBrush(b => ({ ...b, type: p.id }))}>
                  <PieceIcon def={p} side={brush.side} colors={v.sideColors} size={38} />
                </button>
              ))}
            </div>
            <p className="muted small">{t('點棋盤放置棋子；再點一次同樣的棋子可移除。', 'Tap the board to place a piece; tap the same piece again to remove it.')}</p>
            <div className="btns">
              <button onClick={() => mirror('reflect')}>{sn(0)} → {sn(1)}{t('（上下鏡像）', ' (mirror)')}</button>
              <button onClick={() => mirror('rotate')}>{sn(0)} → {sn(1)}{t('（旋轉 180°）', ' (rotate 180°)')}</button>
              <button className="danger" onClick={() => upd({ setup: [] })}>{t('清空棋盤', 'Clear board')}</button>
            </div>
          </>}

          {tab === 'rules' && <>
            <h4>{t('勝負', 'Winning')}</h4>
            <label className="row"><span>{t('勝負條件', 'Win by')}</span>
              <select value={v.rules.win} onChange={e => updRules({ win: e.target.value as RulesDef['win'] })}>
                <option value="checkmate">{t('將死對方的王', 'Checkmating the king')}</option>
                <option value="captureRoyal">{t('吃掉對方的王（可以送王）', 'Capturing the king (moving into check allowed)')}</option>
                <option value="captureAll">{t('吃光對方所有棋子', 'Capturing every piece')}</option>
              </select>
            </label>
            <label className="row"><span>{t('無子可動時', 'Stalemate')}</span>
              <select value={v.rules.stalemate} onChange={e => updRules({ stalemate: e.target.value as RulesDef['stalemate'] })}>
                <option value="draw">{t('和棋（西洋棋）', 'Draw (chess)')}</option>
                <option value="loss">{t('無法走的一方輸（象棋、將棋）', 'Stalemated side loses (xiangqi, shogi)')}</option>
                <option value="win">{t('無法走的一方贏', 'Stalemated side wins')}</option>
              </select>
            </label>
            {check(v.rules.bareKing, b => updRules({ bareKing: b }), t('光王判負（只剩王的一方輸；若能立刻反吃成光王則和棋）', 'Bare king loses (draw if it can bare the other king next move)'))}
            {check(v.rules.bareKingDraw, b => updRules({ bareKingDraw: b }), t('任一方只剩王即和棋', 'A bare king is a draw'))}
            <h4>{t('不能用以下棋子將死', 'Mate by only these pieces is illegal')}</h4>
            {pieceChecks(v.rules.noMateBy, l => updRules({ noMateBy: l }))}
            <h4>{t('將死前的連續將軍中，至少要有一次由以下棋子將軍（否則和棋）', 'A mating series of checks must include a check by one of these (else draw)')}</h4>
            {pieceChecks(v.rules.mateRequiresCheckBy, l => updRules({ mateRequiresCheckBy: l }))}

            <h4>{t('走法', 'Moves')}</h4>
            {num(t('升變區深度（排）', 'Promotion zone (ranks)'), v.rules.promotionZone, n => updRules({ promotionZone: n }), { max: Math.floor(H / 2) })}
            {check(v.rules.drops, b => updRules({ drops: b }), t('吃掉的棋子可以打入（將棋）', 'Captured pieces can be dropped (shogi)'))}
            {check(v.rules.castling, b => updRules({ castling: b }), t('允許入堡（王與「可入堡」棋子）', 'Castling (king with castling partners)'))}
            {check(v.rules.flyingGeneral, b => updRules({ flyingGeneral: b }), t('王不見王（雙王不能在同一直線照面）', 'Flying general (kings may not face each other)'))}
            {check(v.rules.allowPass, b => updRules({ allowPass: b }), t('允許停著（韓國象棋）', 'Passing allowed (janggi)'))}
            {check(v.rules.bikjang, b => updRules({ bikjang: b }), t('照面（빅장）：雙王照面時對方須破解或停著，停著則終局', 'Bikjang: facing kings must be broken or the game ends on a pass'))}

            <h4>{t('重複局面與和棋', 'Repetition and draws')}</h4>
            {num(t('重複局面幾次自動裁決（0 = 關閉）', 'Repetitions for automatic ruling (0 = off)'), v.rules.repetition, n => updRules({ repetition: n }), { max: 10 })}
            {num(t('重複局面幾次可要求和棋（0 = 關閉）', 'Repetitions to claim a draw (0 = off)'), v.rules.repetitionClaim, n => updRules({ repetitionClaim: n || undefined }), { max: 10 })}
            {check(v.rules.perpetualCheckLoses, b => updRules({ perpetualCheckLoses: b }), t('連續將軍造成重複局面時，將軍方判負', 'Perpetual check loses'))}
            {check(v.rules.chasing === 'axf', b => updRules({ chasing: b ? 'axf' : undefined }), t('長將、長捉依亞洲象棋聯合會規則判負（需使用象棋棋子）', 'Perpetual check and chase lose under AXF rules (needs xiangqi pieces)'))}
            {num(t('幾個半回合無吃子自動和棋（0 = 關閉）', 'Plies without capture for an automatic draw (0 = off)'), v.rules.moveLimit, n => updRules({ moveLimit: n }), { step: 10 })}
            {num(t('幾個半回合無吃子可要求和棋（0 = 關閉）', 'Plies without capture to claim a draw (0 = off)'), v.rules.moveLimitClaim, n => updRules({ moveLimitClaim: n || undefined }), { step: 10 })}
            {num(t('總手數上限（0 = 關閉）', 'Maximum plies (0 = off)'), v.rules.maxPlies, n => updRules({ maxPlies: n || undefined }), { step: 50 })}
            {check(v.rules.deadPosition, b => updRules({ deadPosition: b }), t('子力不足時自動和棋（需標記輕子）', 'Draw on insufficient material (needs minor pieces marked)'))}
            {check(!!v.rules.pointsAdjudication, b => updRules({ pointsAdjudication: b ? { bonus: [0, 1.5] } : undefined }), t('原本會和棋時以計分判定（韓國象棋）', 'Decide would-be draws on points (janggi)'))}
            {v.rules.pointsAdjudication && ([0, 1] as Side[]).map(s => (
              <div key={s}>{num(t(`${sn(s)}加分`, `${sn(s)} bonus`), v.rules.pointsAdjudication!.bonus[s], n => {
                const bonus = [...v.rules.pointsAdjudication!.bonus] as [number, number];
                bonus[s] = n;
                updRules({ pointsAdjudication: { bonus } });
              }, { step: 0.5 })}</div>
            ))}
            {check(v.rules.impasse === 'jsa', b => updRules({ impasse: b ? 'jsa' : undefined }), t('持將棋與入玉宣言（日本將棋聯盟）', 'Jishōgi and impasse declaration (JSA)'))}
            <label className="row"><span>{t('數步規則', 'Counting rule')}</span>
              <select value={v.rules.counting ?? ''} onChange={e => updRules({ counting: (e.target.value || undefined) as RulesDef['counting'] })}>
                <option value="">{t('不使用', 'None')}</option>
                <option value="makruk">{t('泰國象棋（棋盤數 64、棋子數）', 'Makruk (board’s and pieces’ honour)')}</option>
                <option value="cambodian">{t('柬埔寨象棋', 'Ouk Chatrang')}</option>
              </select>
            </label>
          </>}
        </div>

        <div className={`editor-preview ${tab === 'pieces' || tab === 'rules' ? 'hide-mobile' : ''}`}>
          <BoardView variant={v} board={board} onCell={tab === 'setup' ? paint : undefined} />
        </div>
      </div>

      {editing && v.pieces[editing] && (
        <PieceEditor def={v.pieces[editing]} variant={v} onClose={() => setEditing(null)}
          onChange={d => setV(prev => ({ ...prev, pieces: { ...prev.pieces, [d.id]: d } }))} />
      )}

      {showLib && (
        <div className="modal-bg" onClick={() => setShowLib(false)}>
          <div className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head"><h3>{t('棋子庫', 'Piece library')}</h3><button className="ghost" onClick={() => setShowLib(false)}>{t('完成', 'Done')}</button></div>
            {pieceLibrary().map(g => (
              <div key={g.variant.id}>
                <h4>{vName(g.variant)}</h4>
                <div className="lib-grid">
                  {g.pieces.map(p => {
                    const has = !!v.pieces[p.id];
                    return (
                      <button key={p.id} disabled={has} onClick={() => addFromLibrary(p)} title={has ? t('已加入', 'Added') : t('加入', 'Add')}>
                        <PieceIcon def={p} side={0} colors={g.variant.sideColors} size={40} />
                        <span className="small">{pName(p)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
