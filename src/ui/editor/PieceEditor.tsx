import type { MoveRule, PieceDef, RegionName, Vec, VariantDef } from '../../engine/types';
import { estimateValue } from '../../engine/engine';
import { ALL8, DIAG, KNIGHT, ORTH } from '../../variants/presets';
import { useLang } from '../../i18n';
import { PieceIcon } from '../PieceGlyph';

const R = 4; // 走法格子半徑：-4..4
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const vkey = (v: Vec) => `${v[0]},${v[1]}`;
type T = (zh: string, en: string) => string;

const regions = (t: T): { v: RegionName | ''; label: string }[] => [
  { v: '', label: t('不限', 'Anywhere') },
  { v: 'palace', label: t('己方九宮', 'Own palace') },
  { v: 'ownHalf', label: t('己方半場', 'Own half') },
  { v: 'enemyHalf', label: t('敵方半場（過河）', 'Enemy half (across the river)') },
  { v: 'promoZone', label: t('升變區', 'Promotion zone') },
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
  const { t, pName } = useLang();
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
  const REGIONS = regions(t);

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
          <span className="muted small">{t('快速：', 'Quick:')}</span>
          {([[t('直', 'Orthogonal'), ORTH], [t('斜', 'Diagonal'), DIAG], [t('八方', 'All 8'), ALL8], [t('馬步', 'Knight'), KNIGHT]] as [string, Vec[]][]).map(([l, vs]) => (
            <button key={l} type="button" className="chip" onClick={() => set({ vectors: vs.map(v => [...v] as Vec) })}>{l}</button>
          ))}
          <button type="button" className="chip" onClick={() => set({ vectors: [] })}>{t('清除', 'Clear')}</button>
        </div>
        <label className="row"><span>{t('距離', 'Range')}</span>
          <select value={rangeKind} onChange={e => set({ range: e.target.value === 'n' ? 2 : Number(e.target.value) })}>
            <option value="1">{t('一次（步/跳）', 'Once (step / leap)')}</option>
            <option value="0">{t('無限滑行', 'Slide any distance')}</option>
            <option value="n">{t('最多 N 次', 'Up to N steps')}</option>
          </select>
          {rangeKind === 'n' && <input type="number" min={2} max={20} value={rule.range}
            onChange={e => set({ range: Math.max(2, Number(e.target.value) || 2) })} style={{ width: 56 }} />}
        </label>
        <label className="row"><span>{t('用途', 'Use')}</span>
          <select value={rule.mode} onChange={e => set({ mode: e.target.value as MoveRule['mode'] })}>
            <option value="both">{t('移動和吃子', 'Move and capture')}</option>
            <option value="move">{t('只能移動', 'Move only')}</option>
            <option value="capture">{t('只能吃子', 'Capture only')}</option>
          </select>
        </label>
        <label className="row"><span>{t('跳子', 'Hopping')}</span>
          <select value={rule.hop ?? ''} onChange={e => set({ hop: (e.target.value || undefined) as MoveRule['hop'] })}>
            <option value="">{t('不跳子', 'None')}</option>
            <option value="cannon">{t('炮：隔一子吃', 'Cannon: captures over one piece')}</option>
            <option value="janggi">{t('包：移動/吃子都要隔子', 'Janggi cannon: always hops')}</option>
          </select>
        </label>
        <label className="row"><span>{t('限制區域', 'Confined to')}</span>
          <select value={rule.confine ?? ''} onChange={e => set({ confine: (e.target.value || undefined) as RegionName })}>
            {REGIONS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </label>
        <label className="row"><span>{t('只在位於', 'Only when in')}</span>
          <select value={rule.when ?? ''} onChange={e => set({ when: (e.target.value || undefined) as RegionName })}>
            {REGIONS.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={!!rule.lame} onChange={e => set({ lame: e.target.checked })} />{t('蹩腳（路徑被擋就不能走，如馬腳、象眼）', 'Can be blocked (like the xiangqi horse and elephant)')}</label>
        <label className="check"><input type="checkbox" checked={!!rule.initial} onChange={e => set({ initial: e.target.checked })} />{t('只限第一次移動', 'First move only')}</label>
        <label className="check"><input type="checkbox" checked={!!rule.notInCheck} onChange={e => set({ notInCheck: e.target.checked })} />{t('被將軍時不能使用', 'Not while in check')}</label>
        {rule.initial && (
          <div className="sub-field">
            <span className="muted small">{t('敵方以下棋子走到本棋子的橫排或直線上後，此走法永久失效：', 'Lost for good once one of these enemy pieces moves onto this piece’s rank or file:')}</span>
            <div className="chips">
              {pieces.map(p => (
                <label key={p.id} className="chip-check">
                  <input type="checkbox" checked={!!rule.lostIfEnemyOnLine?.includes(p.id)}
                    onChange={e => {
                      const list = e.target.checked ? [...(rule.lostIfEnemyOnLine ?? []), p.id] : (rule.lostIfEnemyOnLine ?? []).filter(x => x !== p.id);
                      set({ lostIfEnemyOnLine: list.length ? list : undefined });
                    }} />{pName(p)}
                </label>
              ))}
            </div>
          </div>
        )}
        <label className="check"><input type="checkbox" checked={!!rule.palaceDiag} onChange={e => set({ palaceDiag: e.target.checked })} />{t('斜走只能沿九宮斜線', 'Diagonals only along palace lines')}</label>
        <button type="button" className="danger small-btn" onClick={onDelete}>{t('刪除此走法', 'Delete this move')}</button>
      </div>
    </div>
  );
}

function Preview({ def }: { def: PieceDef }) {
  const { t } = useLang();
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
        <span><i className="p-both" />{t('移動/吃子', 'Move/capture')}</span>
        <span><i className="p-move" />{t('只移動', 'Move only')}</span>
        <span><i className="p-cap" />{t('只吃子', 'Capture only')}</span>
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
  const { lang, t, pName, side } = useLang();
  const en = lang === 'en';
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
          <h3>{t('編輯棋子', 'Edit piece')}</h3>
          <button className="ghost" onClick={onClose}>{t('完成', 'Done')}</button>
        </div>
        <div className="piece-form">
          <section>
            <label className="row"><span>{t('名稱', 'Name')}</span>
              <input value={(en ? def.nameEn : def.name) ?? def.name} onChange={e => set(en ? { nameEn: e.target.value } : { name: e.target.value })} />
            </label>
            <label className="row"><span>{t(`${side(variant, 0)}文字`, `${side(variant, 0)} label`)}</span><input value={def.labels[0]} onChange={e => set({ labels: [e.target.value, def.labels[1]] })} /></label>
            <label className="row"><span>{t(`${side(variant, 1)}文字`, `${side(variant, 1)} label`)}</span><input value={def.labels[1]} onChange={e => set({ labels: [def.labels[0], e.target.value] })} /></label>
            <label className="row"><span>{t('外觀', 'Style')}</span>
              <select value={def.style} onChange={e => set({ style: e.target.value as PieceDef['style'] })}>
                <option value="disc">{t('圓形（象棋）', 'Disc (xiangqi)')}</option>
                <option value="shogi">{t('五角形（將棋）', 'Pentagon (shogi)')}</option>
                <option value="octagon">{t('八角形（韓國象棋）', 'Octagon (janggi)')}</option>
                <option value="glyph">{t('符號（西洋棋，文字填 ♚♛♜♝♞♟）', 'Symbol (chess; use ♚♛♜♝♞♟)')}</option>
              </select>
            </label>
            <label className="row"><span>{t('價值（AI 用）', 'Value (for AI)')}</span>
              <input type="number" step={0.5} placeholder={t(`自動：${estimateValue({ ...def, value: undefined })}`, `Auto: ${estimateValue({ ...def, value: undefined })}`)}
                value={def.value ?? ''} onChange={e => set({ value: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </label>
            {flag('royal', t('王（被將死就輸）', 'Royal (lose when mated)'))}
            {flag('pawn', t('兵類（移動時重置無吃子計數）', 'Pawn (moving resets the no-capture count)'))}
            {flag('enPassant', t('吃過路兵（直走兩格會留下過路兵格）', 'En passant (a double step can be taken en passant)'))}
            {flag('castlePartner', t('可與王入堡', 'Castling partner'))}
            {flag('nifu', t('打入限制：同一直線不能有兩枚（二步）', 'Drop rule: no two on one file (nifu)'))}
            {flag('noDropMate', t('打入限制：不能打入直接將死（打步詰）', 'Drop rule: no mate by drop (uchifuzume)'))}

            <h4>{t('升變', 'Promotion')}</h4>
            <div className="chips">
              {others.map(p => (
                <label key={p.id} className="chip-check">
                  <input type="checkbox" checked={!!def.promotesTo?.includes(p.id)}
                    onChange={e => set({ promotesTo: e.target.checked ? [...(def.promotesTo ?? []), p.id] : def.promotesTo?.filter(x => x !== p.id) })} />
                  <PieceIcon def={p} side={0} colors={variant.sideColors} size={26} />{pName(p)}
                </label>
              ))}
            </div>
            {!!def.promotesTo?.length && <>
              {flag('promoForced', t('進入升變區時必須升變', 'Must promote on entering the zone'))}
              <label className="row"><span>{t('最後幾排強制升變', 'Forced in last N ranks')}</span>
                <input type="number" min={0} max={5} value={def.mustPromoteDepth ?? 0}
                  onChange={e => set({ mustPromoteDepth: Number(e.target.value) || undefined })} />
              </label>
            </>}
            <label className="row"><span>{t('被吃後變回', 'Reverts to when captured')}</span>
              <select value={def.demotesTo ?? ''} onChange={e => set({ demotesTo: e.target.value || undefined })}>
                <option value="">{t('（不變，自己）', '(itself)')}</option>
                {others.map(p => <option key={p.id} value={p.id}>{pName(p)}</option>)}
              </select>
            </label>

            <h4>{t('規則用的身分', 'Roles used by rules')}</h4>
            <label className="row"><span>{t('數步身分', 'Counting role')}</span>
              <select value={def.countAs ?? ''} onChange={e => set({ countAs: (e.target.value || undefined) as PieceDef['countAs'] })}>
                <option value="">{t('（無）', '(none)')}</option>
                <option value="rook">{t('車（Rua）', 'Rook (Rua)')}</option>
                <option value="bishop">{t('象（Khon）', 'Bishop (Khon)')}</option>
                <option value="knight">{t('馬（Ma）', 'Knight (Ma)')}</option>
                <option value="queen">{t('后（Met）', 'Queen (Met)')}</option>
              </select>
            </label>
            <label className="row"><span>{t('象棋兵種（長捉判定）', 'Xiangqi role (chasing)')}</span>
              <select value={def.xqRole ?? ''} onChange={e => set({ xqRole: (e.target.value || undefined) as PieceDef['xqRole'] })}>
                <option value="">{t('（無）', '(none)')}</option>
                <option value="king">{t('將帥', 'General')}</option>
                <option value="advisor">{t('士仕', 'Advisor')}</option>
                <option value="elephant">{t('象相', 'Elephant')}</option>
                <option value="horse">{t('馬', 'Horse')}</option>
                <option value="rook">{t('車', 'Chariot')}</option>
                <option value="cannon">{t('炮', 'Cannon')}</option>
                <option value="soldier">{t('兵卒', 'Soldier')}</option>
              </select>
            </label>
            <label className="row"><span>{t('輕子（子力不足判定）', 'Minor piece (dead position)')}</span>
              <select value={def.minor ?? ''} onChange={e => set({ minor: (e.target.value || undefined) as PieceDef['minor'] })}>
                <option value="">{t('（否）', '(no)')}</option>
                <option value="knight">{t('馬類', 'Knight')}</option>
                <option value="bishop">{t('象類', 'Bishop')}</option>
              </select>
            </label>
            <label className="row"><span>{t('計分（持將棋／韓國象棋）', 'Points (jishōgi / janggi)')}</span>
              <input type="number" step={0.5} value={def.points ?? ''} placeholder={t('預設', 'default')}
                onChange={e => set({ points: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </label>
          </section>
          <section>
            <h4>{t('走法預覽', 'Move preview')} <span className="muted small">{t('（向上為前進）', '(up is forward)')}</span></h4>
            <Preview def={def} />
          </section>
        </div>
        <h4>{t('走法規則', 'Move rules')} <span className="muted small">{t('點格子設定方向；滑行時只需點第一格', 'Tap cells to set directions; for slides tap only the first cell')}</span></h4>
        <div className="rules-list">
          {def.moves.map((m, i) => (
            <RuleEditor key={i} rule={m} pieces={Object.values(variant.pieces)}
              onChange={r => set({ moves: def.moves.map((x, j) => (j === i ? r : x)) })}
              onDelete={() => set({ moves: def.moves.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <button onClick={() => onChange({ ...def, moves: [...def.moves, { vectors: [], range: 1, mode: 'both' }] })}>{t('＋ 新增走法', '+ Add a move')}</button>
      </div>
    </div>
  );
}
