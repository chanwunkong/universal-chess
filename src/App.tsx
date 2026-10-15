import { useRef, useState } from 'react';
import type { VariantDef } from './engine/types';
import { PRESETS } from './variants/presets';
import { exportVariant, importVariant, loadCustom, saveCustom } from './storage';
import { GameView } from './ui/GameView';
import { Tutorial } from './ui/Tutorial';
import { Editor, blankFrom } from './ui/editor/Editor';
import { BoardView } from './ui/BoardView';
import { Engine } from './engine/engine';
import { LangToggle, useLang } from './i18n';

type Screen =
  | { kind: 'home' }
  | { kind: 'game'; variant: VariantDef; vsAI?: boolean; from?: Screen }
  | { kind: 'tutorial'; variant: VariantDef }
  | { kind: 'editor'; variant: VariantDef };

function Thumb({ v }: { v: VariantDef }) {
  return <div className="thumb"><BoardView variant={v} board={new Engine(v).initialState().board} /></div>;
}

export default function App() {
  const { t, vName, vDesc } = useLang();
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
    if (!confirm(t('確定刪除這個自訂變體？', 'Delete this custom variant?'))) return;
    setCustom(prev => {
      const list = prev.filter(x => x.id !== id);
      saveCustom(list);
      return list;
    });
  }

  if (screen.kind === 'tutorial')
    return <Tutorial variant={screen.variant} onBack={() => setScreen({ kind: 'home' })}
      onPlayAI={() => setScreen({ kind: 'game', variant: screen.variant, vsAI: true, from: screen })} />;

  if (screen.kind === 'game')
    return <GameView variant={screen.variant} vsAI={screen.vsAI} onBack={() => setScreen(screen.from ?? { kind: 'home' })}
      onEdit={() => setScreen({ kind: 'editor', variant: screen.variant.custom ? screen.variant : blankFrom(screen.variant) })} />;

  if (screen.kind === 'editor')
    return <Editor initial={screen.variant} onBack={() => setScreen({ kind: 'home' })}
      onSave={v => { const s = store(v); setScreen({ kind: 'editor', variant: s }); }}
      onPlay={v => setScreen({ kind: 'game', variant: store(v) })} />;

  return (
    <div className="home">
      <header className="hero">
        <div className="hero-top">
          <h1>{t('萬象棋盤', 'Universal Chess')}</h1>
          <LangToggle />
        </div>
        <p>{t('世界各地的象棋都在這裡，還能自己設計棋盤、棋子和規則。', "Chess games from around the world — and you can design your own boards, pieces and rules.")}</p>
      </header>

      <h2>{t('各地象棋', 'Regional games')}</h2>
      <div className="cards">
        {PRESETS.map(v => (
          <article key={v.id} className="card">
            <Thumb v={v} />
            <div className="card-body">
              <h3>{vName(v)}</h3>
              <p className="muted small">{vDesc(v)}</p>
              <div className="btns">
                <button className="primary" onClick={() => setScreen({ kind: 'game', variant: v })}>{t('開始對局', 'Play')}</button>
                <button onClick={() => setScreen({ kind: 'tutorial', variant: v })}>{t('教學', 'Learn')}</button>
                <button onClick={() => setScreen({ kind: 'editor', variant: blankFrom(v) })}>{t('以此改編', 'Remix')}</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head">
        <h2>{t('我的自訂變體', 'My variants')}</h2>
        <div className="btns">
          <button className="primary" onClick={() => setScreen({ kind: 'editor', variant: blankFrom(PRESETS[0]) })}>{t('＋ 建立自訂變體', '+ New variant')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('匯入 JSON', 'Import JSON')}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { store(await importVariant(f)); } catch (err) { alert(t('匯入失敗：', 'Import failed: ') + (err as Error).message); }
          }} />
        </div>
      </div>
      {custom.length === 0 && <p className="muted">{t('還沒有自訂變體。可以從上面任一變體「以此改編」，或建立全新的變體。', 'No custom variants yet. Remix any game above, or start a new one.')}</p>}
      <div className="cards">
        {custom.map(v => (
          <article key={v.id} className="card">
            <Thumb v={v} />
            <div className="card-body">
              <h3>{vName(v)}</h3>
              <p className="muted small">{vDesc(v)}</p>
              <div className="btns">
                <button className="primary" onClick={() => setScreen({ kind: 'game', variant: v })}>{t('開始對局', 'Play')}</button>
                <button onClick={() => setScreen({ kind: 'editor', variant: v })}>{t('編輯', 'Edit')}</button>
                <button onClick={() => exportVariant(v)}>{t('匯出', 'Export')}</button>
                <button className="danger" onClick={() => remove(v.id)}>{t('刪除', 'Delete')}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
