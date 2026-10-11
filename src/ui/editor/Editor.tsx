import { useMemo, useState } from 'react';
import type { PieceDef, Placement, RulesDef, Side, VariantDef } from '../../engine/types';
import { ALL8, PRESETS, pieceLibrary } from '../../variants/presets';
import { clone } from '../../storage';
import { BoardView } from '../BoardView';
import { PieceIcon } from '../PieceGlyph';
import { PieceEditor } from './PieceEditor';

type Tab = 'board' | 'pieces' | 'setup' | 'rules';

interface Props {
  initial: VariantDef;
  onSave: (v: VariantDef) => void;
  onPlay: (v: VariantDef) => void;
  onBack: () => void;
}

export function blankFrom(base: VariantDef): VariantDef {
  return { ...clone(base), id: 'custom-' + Date.now(), name: `自訂：${base.name}`, custom: true };
}

/** 檢查變體能否正常遊玩 */
function validate(v: VariantDef): string[] {
  const w: string[] = [];
  for (const s of [0, 1] as Side[]) {
    const mine = v.setup.filter(p => p.side === s);
    if (!mine.length) w.push(`${v.sideNames[s]}沒有任何棋子。`);
    else if (v.rules.win !== 'captureAll' && !mine.some(p => v.pieces[p.type]?.royal))
      w.push(`${v.sideNames[s]}沒有「王」，無法被將死或吃王；建議勝負條件改為「吃光對方」。`);
  }
  for (const p of Object.values(v.pieces)) {
    if (!p.moves.length || p.moves.every(m => !m.vectors.length)) w.push(`「${p.name}」沒有任何走法。`);
    if (p.moves.some(m => m.confine === 'palace' || m.when === 'palace') && !v.board.palaces?.length)
      w.push(`「${p.name}」限制在九宮內，但棋盤沒有九宮。`);
    if (p.promotesTo?.length && !v.rules.promotionZone) w.push(`「${p.name}」可以升變，但升變區深度為 0。`);
  }
  return w;
}

export function Editor({ initial, onSave, onPlay, onBack }: Props) {
  const [v, setV] = useState<VariantDef>(() => clone(initial));
  const [tab, setTab] = useState<Tab>('board');
  const [editing, setEditing] = useState<string | null>(null);
  const [showLib, setShowLib] = useState(false);
  const [brush, setBrush] = useState<{ type: string | null; side: Side }>({ type: null, side: 0 });
  const warnings = useMemo(() => validate(v), [v]);

  const upd = (patch: Partial<VariantDef>) => setV(prev => ({ ...prev, ...patch }));
  const updRules = (patch: Partial<RulesDef>) => setV(prev => ({ ...prev, rules: { ...prev.rules, ...patch } }));
  const W = v.board.width, H = v.board.height;

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
    upd({ pieces: { ...v.pieces, [id]: { id, name: '新棋子', labels: ['新', '新'], style: 'disc', moves: [{ vectors: ALL8.map(x => [...x] as [number, number]), range: 1, mode: 'both' }] } } });
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
    setV(prev => ({
      ...prev, pieces,
      setup: prev.setup.filter(p => p.type !== id),
      rules: { ...prev.rules, noMateBy: prev.rules.noMateBy?.filter(x => x !== id) },
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

  return (
    <div className="editor">
      <header className="editor-head">
        <button className="icon-btn" onClick={onBack} aria-label="返回">‹</button>
        <input className="title-input" value={v.name} onChange={e => upd({ name: e.target.value })} />
        <div className="head-actions">
        <label className="row base-select">
          <span className="muted small">套用基礎</span>
          <select value="" onChange={e => {
            const base = PRESETS.find(p => p.id === e.target.value);
            if (base && confirm(`以「${base.name}」取代目前的設定？`)) setV({ ...blankFrom(base), id: v.id });
          }}>
            <option value="">選擇…</option>
            {PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <button onClick={() => onSave(v)}>儲存</button>
        <button className="primary" onClick={() => onPlay(v)}>儲存並試玩</button>
        </div>
      </header>

      <nav className="tabs">
        {([['board', '棋盤'], ['pieces', `棋子（${pieceList.length}）`], ['setup', '擺子'], ['rules', '規則']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{l}</button>
        ))}
      </nav>

      {warnings.length > 0 && <ul className="warnings">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

      <div className="editor-body">
        <div className="editor-form">
          {tab === 'board' && <>
            <label className="row"><span>說明</span><input value={v.description ?? ''} onChange={e => upd({ description: e.target.value })} /></label>
            <label className="row"><span>寬度</span><input type="number" min={3} max={16} value={W} onChange={e => resize(Number(e.target.value), H)} /></label>
            <label className="row"><span>高度</span><input type="number" min={3} max={16} value={H} onChange={e => resize(W, Number(e.target.value))} /></label>
            <label className="row"><span>落子位置</span>
              <select value={v.board.cell} onChange={e => upd({ board: { ...v.board, cell: e.target.value as 'square' | 'intersection' } })}>
                <option value="square">格子內（西洋棋、將棋）</option>
                <option value="intersection">交叉點上（象棋）</option>
              </select>
            </label>
            {check(v.board.checkered, b => upd({ board: { ...v.board, checkered: b } }), '黑白相間格子')}
            {check(v.board.river, b => upd({ board: { ...v.board, river: b } }), '中間畫河界（僅顯示；「過河」以半場判定）')}
            <h4>九宮</h4>
            {(v.board.palaces ?? []).map((p, i) => (
              <div key={i} className="palace-row">
                <span>{v.sideNames[p.side]}</span>
                {(['x', 'y', 'w', 'h'] as const).map(k => (
                  <label key={k}>{({ x: '左', y: '下', w: '寬', h: '高' })[k]}
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
            <button onClick={addPalaces}>自動加入雙方九宮（3×3）</button>
            <h4>雙方</h4>
            {([0, 1] as Side[]).map(s => (
              <div key={s} className="row">
                <input value={v.sideNames[s]} onChange={e => { const n = [...v.sideNames] as [string, string]; n[s] = e.target.value; upd({ sideNames: n }); }} />
                <input type="color" value={v.sideColors[s]} onChange={e => { const c = [...v.sideColors] as [string, string]; c[s] = e.target.value; upd({ sideColors: c }); }} />
              </div>
            ))}
          </>}

          {tab === 'pieces' && <>
            <div className="btns">
              <button onClick={() => setShowLib(true)}>從棋子庫加入</button>
              <button onClick={newPiece}>＋ 設計新棋子</button>
            </div>
            <ul className="piece-list">
              {pieceList.map(p => (
                <li key={p.id}>
                  <PieceIcon def={p} side={0} colors={v.sideColors} size={36} />
                  <PieceIcon def={p} side={1} colors={v.sideColors} size={36} />
                  <span className="grow">{p.name}{p.royal && <em className="tag">王</em>}{p.promotesTo?.length ? <em className="tag">可升變</em> : null}</span>
                  <button className="small-btn" onClick={() => setEditing(p.id)}>編輯</button>
                  <button className="small-btn" onClick={() => {
                    const id = 'u.' + Date.now().toString(36);
                    upd({ pieces: { ...v.pieces, [id]: { ...clone(p), id, name: p.name + '（複製）' } } });
                  }}>複製</button>
                  <button className="danger small-btn" onClick={() => deletePiece(p.id)}>刪除</button>
                </li>
              ))}
            </ul>
          </>}

          {tab === 'setup' && <>
            <div className="row">
              <span>擺放：</span>
              {([0, 1] as Side[]).map(s => (
                <button key={s} className={brush.side === s ? 'active' : ''} onClick={() => setBrush(b => ({ ...b, side: s }))}>{v.sideNames[s]}</button>
              ))}
            </div>
            <div className="palette">
              <button className={brush.type === null ? 'selected' : ''} onClick={() => setBrush(b => ({ ...b, type: null }))} title="橡皮擦">🧽</button>
              {pieceList.map(p => (
                <button key={p.id} className={brush.type === p.id ? 'selected' : ''} title={p.name}
                  onClick={() => setBrush(b => ({ ...b, type: p.id }))}>
                  <PieceIcon def={p} side={brush.side} colors={v.sideColors} size={38} />
                </button>
              ))}
            </div>
            <p className="muted small">點棋盤放置棋子；再點一次同樣的棋子可移除。</p>
            <div className="btns">
              <button onClick={() => mirror('reflect')}>{v.sideNames[0]} → {v.sideNames[1]}（上下鏡像）</button>
              <button onClick={() => mirror('rotate')}>{v.sideNames[0]} → {v.sideNames[1]}（旋轉 180°）</button>
              <button className="danger" onClick={() => upd({ setup: [] })}>清空棋盤</button>
            </div>
          </>}

          {tab === 'rules' && <>
            <label className="row"><span>勝負條件</span>
              <select value={v.rules.win} onChange={e => updRules({ win: e.target.value as RulesDef['win'] })}>
                <option value="checkmate">將死對方的王</option>
                <option value="captureRoyal">吃掉對方的王（可以送王）</option>
                <option value="captureAll">吃光對方所有棋子</option>
              </select>
            </label>
            <label className="row"><span>無子可動時</span>
              <select value={v.rules.stalemate} onChange={e => updRules({ stalemate: e.target.value as RulesDef['stalemate'] })}>
                <option value="draw">和棋（西洋棋）</option>
                <option value="loss">無法走的一方輸（象棋、將棋）</option>
                <option value="win">無法走的一方贏</option>
              </select>
            </label>
            <label className="row"><span>升變區深度（排）</span>
              <input type="number" min={0} max={Math.floor(H / 2)} value={v.rules.promotionZone} onChange={e => updRules({ promotionZone: Number(e.target.value) || 0 })} />
            </label>
            {check(v.rules.drops, b => updRules({ drops: b }), '吃掉的棋子可以打入（將棋）')}
            {check(v.rules.castling, b => updRules({ castling: b }), '允許入堡（王與「可入堡」棋子）')}
            {check(v.rules.flyingGeneral, b => updRules({ flyingGeneral: b }), '王不見王（雙王不能在同一直線照面）')}
            {check(v.rules.allowPass, b => updRules({ allowPass: b }), '允許停著（韓國象棋）')}
            {check(v.rules.bareKing, b => updRules({ bareKing: b }), '光王判負（只剩王的一方輸；若能立刻反吃成光王則和棋）')}
            <label className="row"><span>數步規則</span>
              <select value={v.rules.counting ?? ''} onChange={e => updRules({ counting: (e.target.value || undefined) as RulesDef['counting'] })}>
                <option value="">不使用</option>
                <option value="makruk">泰國象棋（棋盤數 64、棋子數）</option>
                <option value="cambodian">柬埔寨象棋</option>
              </select>
            </label>
            <h4>不能用以下棋子將死</h4>
            <div className="chips">
              {pieceList.map(p => (
                <label key={p.id} className="chip-check">
                  <input type="checkbox" checked={!!v.rules.noMateBy?.includes(p.id)}
                    onChange={e => updRules({ noMateBy: e.target.checked ? [...(v.rules.noMateBy ?? []), p.id] : v.rules.noMateBy?.filter(x => x !== p.id) })} />
                  {p.name}
                </label>
              ))}
            </div>
            <label className="row"><span>重複局面幾次和棋（0 = 關閉）</span>
              <input type="number" min={0} max={10} value={v.rules.repetition} onChange={e => updRules({ repetition: Number(e.target.value) || 0 })} />
            </label>
            <label className="row"><span>幾個半回合無吃子和棋（0 = 關閉）</span>
              <input type="number" min={0} step={10} value={v.rules.moveLimit} onChange={e => updRules({ moveLimit: Number(e.target.value) || 0 })} />
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
            <div className="modal-head"><h3>棋子庫</h3><button className="ghost" onClick={() => setShowLib(false)}>完成</button></div>
            {pieceLibrary().map(g => (
              <div key={g.group}>
                <h4>{g.group}</h4>
                <div className="lib-grid">
                  {g.pieces.map(p => {
                    const has = !!v.pieces[p.id];
                    return (
                      <button key={p.id} disabled={has} onClick={() => addFromLibrary(p)} title={has ? '已加入' : '加入'}>
                        <PieceIcon def={p} side={0} colors={PRESETS.find(x => x.pieces[p.id])!.sideColors} size={40} />
                        <span className="small">{p.name}</span>
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
