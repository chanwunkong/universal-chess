import type { MoveRule, PieceDef, RegionName, Vec, VariantDef } from '../../engine/types';
import { estimateValue } from '../../engine/engine';
import { ALL8, DIAG, KNIGHT, ORTH } from '../../variants/presets';
import { PieceIcon } from '../PieceGlyph';

const R = 4; // 走法格子半徑：-4..4
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const vkey = (v: Vec) => `${v[0]},${v[1]}`;

const REGIONS: { v: RegionName | ''; label: string }[] = [
  { v: '', label: '不限' },
  { v: 'palace', label: '己方九宮' },
  { v: 'ownHalf', label: '己方半場' },
  { v: 'enemyHalf', label: '敵方半場（過河）' },
  { v: 'promoZone', label: '升變區' },
];

/** 某條規則在格子上可以到達的位置（空盤） */
function reach(rule: MoveRule): Map<string, 'r-vec' | 'r-ext'> {
  const m = new Map<string, 'r-vec' | 'r-ext'>();
  for (const v of rule.vectors) {
    m.set(vkey(v), 'r-vec');
    if (rule.range !== 1) {
      const max = rule.range === 0 ? 9 : rule.range;
      for (let k = 2; k <= max; k++) {
        const x = v[0] * k, y = v[1] * k;
        if (Math.abs(x) > R || Math.abs(y) > R) break;
        if (!m.has(`${x},${y}`)) m.set(`${x},${y}`, 'r-ext');
      }
    }
  }
  return m;
}

function RuleEditor({ rule, pieces, onChange, onDelete }: { rule: MoveRule; pieces: PieceDef[]; onChange: (r: MoveRule) => void; onDelete: () => void }) {
  const cells = reach(rule);
  const set = (patch: Partial<MoveRule>) => {
    const next = { ...rule, ...patch };
    for (const k of Object.keys(patch) as (keyof MoveRule)[]) {
      const val = next[k];
      if (val === false || val === undefined) delete next[k];
    }
    onChange(next);
  };
  const toggle = (v: Vec) => {
    const k = vkey(v);
    const has = rule.vectors.some(x => vkey(x) === k);
    set({ vectors: has ? rule.vectors.filter(x => vkey(x) !== k) : [...rule.vectors, v] });
  };
  const rangeKind = rule.range === 1 ? '1' : rule.range === 0 ? '0' : 'n';

  return (
    <div className="rule-card">
      <div className="vec-grid" style={{ gridTemplateColumns: `repeat(${2 * R + 1}, 1fr)` }}>
        {range(2 * R + 1).map(row => range(2 * R + 1).map(col => {
          const x = col - R, y = R - row;
          const center = x === 0 && y === 0;
          const st = cells.get(`${x},${y}`);
          return (
            <button key={`${x},${y}`} type="button" disabled={center}
              className={`vec ${center ? 'center' : ''} ${st ?? ''} mode-${rule.mode}`}
              title={`(${x}, ${y})`} onClick={() => toggle([x, y])} />
          );
        }))}
      </div>
      <div className="rule-fields">
        <div className="quick">
          <span className="muted small">快速：</span>
          {([['直', ORTH], ['斜', DIAG], ['八方', ALL8], ['馬步', KNIGHT]] as [string, Vec[]][]).map(([l, vs]) => (
            <button key={l} type="button" className="chip" onClick={() => set({ vectors: vs.map(v => [...v] as Vec) })}>{l}</button>
          ))}
          <button type="button" className="chip" onClick={() => set({ vectors: [] })}>清除</button>
        </div>
        <label className="row"><span>距離</span>
          <select value={rangeKind} onChange={e => set({ range: e.target.value === 'n' ? 2 : Number(e.target.value) })}>
            <option value="1">一次（步/跳）</option>
            <option value="0">無限滑行</option>
            <option value="n">最多 N 次</option>
          </select>
          {rangeKind === 'n' && <input type="number" min={2} max={20} value={rule.range}
            onChange={e => set({ range: Math.max(2, Number(e.target.value) || 2) })} style={{ width: 56 }} />}
        </label>
        <label className="row"><span>用途</span>
          <select value={rule.mode} onChange={e => set({ mode: e.target.value as MoveRule['mode'] })}>
            <option value="both">移動和吃子</option>
            <option value="move">只能移動</option>
            <option value="capture">只能吃子</option>
          </select>
        </label>
        <label className="row"><span>跳子</span>
          <select value={rule.hop ?? ''} onChange={e => set({ hop: (e.target.value || undefined) as MoveRule['hop'] })}>
            <option value="">不跳子</option>
            <option value="cannon">炮：隔一子吃</option>
            <option value="janggi">包：移動/吃子都要隔子</option>
          </select>
        </label>
        <label className="row"><span>限制區域</span>
          <select value={rule.confine ?? ''} onChange={e => set({ confine: (e.target.value || undefined) as RegionName })}>
            {REGIONS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </label>
        <label className="row"><span>只在位於</span>
          <select value={rule.when ?? ''} onChange={e => set({ when: (e.target.value || undefined) as RegionName })}>
            {REGIONS.map(r => <option key={r.v} value={r.v}>{r.v ? r.label + '時有效' : '任何位置'}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={!!rule.lame} onChange={e => set({ lame: e.target.checked })} />蹩腳（路徑被擋就不能走，如馬腳、象眼）</label>
        <label className="check"><input type="checkbox" checked={!!rule.initial} onChange={e => set({ initial: e.target.checked })} />只限第一次移動</label>
        <label className="check"><input type="checkbox" checked={!!rule.notInCheck} onChange={e => set({ notInCheck: e.target.checked })} />被將軍時不能使用</label>
        {rule.initial && (
          <div className="sub-field">
            <span className="muted small">敵方以下棋子走到本棋子的橫排或直線上後，此走法永久失效：</span>
            <div className="chips">
              {pieces.map(p => (
                <label key={p.id} className="chip-check">
                  <input type="checkbox" checked={!!rule.lostIfEnemyOnLine?.includes(p.id)}
                    onChange={e => {
                      const list = e.target.checked ? [...(rule.lostIfEnemyOnLine ?? []), p.id] : (rule.lostIfEnemyOnLine ?? []).filter(x => x !== p.id);
                      set({ lostIfEnemyOnLine: list.length ? list : undefined });
                    }} />{p.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={!!rule.palaceDiag} onChange={e => set({ palaceDiag: e.target.checked })} />斜走只能沿九宮斜線</label>
        <button type="button" className="danger small-btn" onClick={onDelete}>刪除此走法</button>
      </div>
    </div>
  );
}

function Preview({ def }: { def: PieceDef }) {
  const map = new Map<string, Set<string>>();
  for (const r of def.moves) for (const [k] of reach(r)) {
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(r.mode);
  }
  const cls = (s?: Set<string>) => !s ? '' : s.has('both') || (s.has('move') && s.has('capture')) ? 'p-both' : s.has('move') ? 'p-move' : 'p-cap';
  return (
    <div>
      <div className="vec-grid preview" style={{ gridTemplateColumns: `repeat(${2 * R + 1}, 1fr)` }}>
        {range(2 * R + 1).map(row => range(2 * R + 1).map(col => {
          const x = col - R, y = R - row;
          return <div key={`${x},${y}`} className={`vec ${x === 0 && y === 0 ? 'center' : ''} ${cls(map.get(`${x},${y}`))}`} />;
        }))}
      </div>
      <div className="legend small">
        <span><i className="p-both" />移動/吃子</span><span><i className="p-move" />只移動</span><span><i className="p-cap" />只吃子</span>
      </div>
    </div>
  );
}

interface Props {
  def: PieceDef;
  variant: VariantDef;
  onChange: (d: PieceDef) => void;
  onClose: () => void;
}

export function PieceEditor({ def, variant, onChange, onClose }: Props) {
  const set = (patch: Partial<PieceDef>) => {
    const next = { ...def, ...patch };
    for (const k of Object.keys(patch) as (keyof PieceDef)[]) {
      const v = next[k];
      if (v === false || v === undefined || v === '' || (k === 'promotesTo' && Array.isArray(v) && !v.length)) delete next[k];
    }
    onChange(next);
  };
  const others = Object.values(variant.pieces).filter(p => p.id !== def.id);
  const flag = (k: keyof PieceDef, label: string) => (
    <label className="check"><input type="checkbox" checked={!!def[k]} onChange={e => set({ [k]: e.target.checked })} />{label}</label>
  );

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <PieceIcon def={def} side={0} colors={variant.sideColors} size={44} />
          <PieceIcon def={def} side={1} colors={variant.sideColors} size={44} />
          <h3>編輯棋子</h3>
          <button className="ghost" onClick={onClose}>完成</button>
        </div>
        <div className="piece-form">
          <section>
            <label className="row"><span>名稱</span><input value={def.name} onChange={e => set({ name: e.target.value })} /></label>
            <label className="row"><span>{variant.sideNames[0]}文字</span><input value={def.labels[0]} onChange={e => set({ labels: [e.target.value, def.labels[1]] })} /></label>
            <label className="row"><span>{variant.sideNames[1]}文字</span><input value={def.labels[1]} onChange={e => set({ labels: [def.labels[0], e.target.value] })} /></label>
            <label className="row"><span>外觀</span>
              <select value={def.style} onChange={e => set({ style: e.target.value as PieceDef['style'] })}>
                <option value="disc">圓形（象棋）</option>
                <option value="shogi">五角形（將棋）</option>
                <option value="octagon">八角形（韓國象棋）</option>
                <option value="glyph">符號（西洋棋，文字填 ♚♛♜♝♞♟）</option>
              </select>
            </label>
            <label className="row"><span>價值（AI 用）</span>
              <input type="number" step={0.5} placeholder={`自動：${estimateValue({ ...def, value: undefined })}`}
                value={def.value ?? ''} onChange={e => set({ value: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </label>
            {flag('royal', '王（被將死就輸）')}
            {flag('pawn', '兵類（移動時重置無吃子計數）')}
            {flag('enPassant', '吃過路兵（直走兩格會留下過路兵格）')}
            {flag('castlePartner', '可與王入堡')}
            {flag('nifu', '打入限制：同一直線不能有兩枚（二步）')}
            {flag('noDropMate', '打入限制：不能打入直接將死（打步詰）')}

            <h4>升變</h4>
            <div className="chips">
              {others.map(p => (
                <label key={p.id} className="chip-check">
                  <input type="checkbox" checked={!!def.promotesTo?.includes(p.id)}
                    onChange={e => set({ promotesTo: e.target.checked ? [...(def.promotesTo ?? []), p.id] : def.promotesTo?.filter(x => x !== p.id) })} />
                  <PieceIcon def={p} side={0} colors={variant.sideColors} size={26} />{p.name}
                </label>
              ))}
            </div>
            {!!def.promotesTo?.length && <>
              {flag('promoForced', '進入升變區時必須升變')}
              <label className="row"><span>最後幾排強制升變</span>
                <input type="number" min={0} max={5} value={def.mustPromoteDepth ?? 0}
                  onChange={e => set({ mustPromoteDepth: Number(e.target.value) || undefined })} />
              </label>
            </>}
            <label className="row"><span>數步身分</span>
              <select value={def.countAs ?? ''} onChange={e => set({ countAs: (e.target.value || undefined) as PieceDef['countAs'] })}>
                <option value="">（無）</option>
                <option value="rook">車（Rua）</option>
                <option value="bishop">象（Khon）</option>
                <option value="knight">馬（Ma）</option>
                <option value="queen">后（Met）</option>
              </select>
            </label>
            <label className="row"><span>被吃後變回</span>
              <select value={def.demotesTo ?? ''} onChange={e => set({ demotesTo: e.target.value || undefined })}>
                <option value="">（不變，自己）</option>
                {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </section>
          <section>
            <h4>走法預覽 <span className="muted small">（向上為前進）</span></h4>
            <Preview def={def} />
          </section>
        </div>
        <h4>走法規則 <span className="muted small">點格子設定方向；滑行時只需點第一格</span></h4>
        <div className="rules-list">
          {def.moves.map((m, i) => (
            <RuleEditor key={i} rule={m} pieces={Object.values(variant.pieces)}
              onChange={r => set({ moves: def.moves.map((x, j) => (j === i ? r : x)) })}
              onDelete={() => set({ moves: def.moves.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <button onClick={() => onChange({ ...def, moves: [...def.moves, { vectors: [], range: 1, mode: 'both' }] })}>＋ 新增走法</button>
      </div>
    </div>
  );
}
