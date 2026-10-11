import { useRef, useState } from 'react';
import type { VariantDef } from './engine/types';
import { PRESETS } from './variants/presets';
import { exportVariant, importVariant, loadCustom, saveCustom } from './storage';
import { GameView } from './ui/GameView';
import { Editor, blankFrom } from './ui/editor/Editor';
import { BoardView } from './ui/BoardView';
import { Engine } from './engine/engine';

type Screen =
  | { kind: 'home' }
  | { kind: 'game'; variant: VariantDef }
  | { kind: 'editor'; variant: VariantDef };

function Thumb({ v }: { v: VariantDef }) {
  return <div className="thumb"><BoardView variant={v} board={new Engine(v).initialState().board} /></div>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [custom, setCustom] = useState<VariantDef[]>(loadCustom);
  const fileRef = useRef<HTMLInputElement>(null);

  function store(v: VariantDef): VariantDef {
    const saved = { ...v, custom: true };
    setCustom(prev => {
      const list = prev.some(x => x.id === saved.id) ? prev.map(x => (x.id === saved.id ? saved : x)) : [...prev, saved];
      saveCustom(list);
      return list;
    });
    return saved;
  }

  function remove(id: string) {
    if (!confirm('確定刪除這個自訂變體？')) return;
    setCustom(prev => {
      const list = prev.filter(x => x.id !== id);
      saveCustom(list);
      return list;
    });
  }

  if (screen.kind === 'game')
    return <GameView variant={screen.variant} onBack={() => setScreen({ kind: 'home' })}
      onEdit={() => setScreen({ kind: 'editor', variant: screen.variant.custom ? screen.variant : blankFrom(screen.variant) })} />;

  if (screen.kind === 'editor')
    return <Editor initial={screen.variant} onBack={() => setScreen({ kind: 'home' })}
      onSave={v => { const s = store(v); setScreen({ kind: 'editor', variant: s }); }}
      onPlay={v => setScreen({ kind: 'game', variant: store(v) })} />;

  return (
    <div className="home">
      <header className="hero">
        <h1>萬象棋盤</h1>
        <p>西洋棋、中國象棋、日本將棋、韓國象棋、越南象棋、蒙古象棋——還能自己設計棋盤、棋子和規則。</p>
      </header>

      <h2>經典變體</h2>
      <div className="cards">
        {PRESETS.map(v => (
          <article key={v.id} className="card">
            <Thumb v={v} />
            <div className="card-body">
              <h3>{v.name}</h3>
              <p className="muted small">{v.description}</p>
              <div className="btns">
                <button className="primary" onClick={() => setScreen({ kind: 'game', variant: v })}>開始對局</button>
                <button onClick={() => setScreen({ kind: 'editor', variant: blankFrom(v) })}>以此改編</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head">
        <h2>我的自訂變體</h2>
        <div className="btns">
          <button className="primary" onClick={() => setScreen({ kind: 'editor', variant: blankFrom(PRESETS[0]) })}>＋ 建立自訂變體</button>
          <button onClick={() => fileRef.current?.click()}>匯入 JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { store(await importVariant(f)); } catch (err) { alert('匯入失敗：' + (err as Error).message); }
          }} />
        </div>
      </div>
      {custom.length === 0 && <p className="muted">還沒有自訂變體。可以從上面任一經典變體「以此改編」，或建立全新的變體。</p>}
      <div className="cards">
        {custom.map(v => (
          <article key={v.id} className="card">
            <Thumb v={v} />
            <div className="card-body">
              <h3>{v.name}</h3>
              <p className="muted small">{v.description}</p>
              <div className="btns">
                <button className="primary" onClick={() => setScreen({ kind: 'game', variant: v })}>開始對局</button>
                <button onClick={() => setScreen({ kind: 'editor', variant: v })}>編輯</button>
                <button onClick={() => exportVariant(v)}>匯出</button>
                <button className="danger" onClick={() => remove(v.id)}>刪除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
