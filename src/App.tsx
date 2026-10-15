import { useRef, useState } from 'react';
import type { VariantDef } from './engine/types';
import { PRESETS } from './variants/presets';
import { exportVariant, importVariant, loadCustom, saveCustom } from './storage';
import { GameView } from './ui/GameView';
import { Tutorial } from './ui/Tutorial';
import { RuleBook } from './ui/RuleBook';
import { MixSetup } from './ui/MixSetup';
import { Campaign } from './ui/Campaign';
import { RULES } from './rules/catalog';
import { Editor, blankFrom } from './ui/editor/Editor';
import { BoardView } from './ui/BoardView';
import { Engine } from './engine/engine';
import { LangToggle, useLang } from './i18n';

type Screen =
  | { kind: 'home' }
  | { kind: 'game'; variant: VariantDef; vsAI?: boolean; from?: Screen }
  | { kind: 'tutorial'; variant: VariantDef; from?: Screen }
  | { kind: 'rules' }
  | { kind: 'mix' }
  | { kind: 'campaign' }
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

  if (screen.kind === 'campaign') return <Campaign onBack={() => setScreen({ kind: 'home' })} />;

  if (screen.kind === 'mix')
    return <MixSetup onBack={() => setScreen({ kind: 'home' })} onSave={v => store(v)}
      onPlay={v => setScreen({ kind: 'game', variant: v, from: screen })} />;

  if (screen.kind === 'rules')
    return <RuleBook onBack={() => setScreen({ kind: 'home' })} onOpenGame={v => setScreen({ kind: 'tutorial', variant: v, from: screen })} />;

  if (screen.kind === 'tutorial')
    return <Tutorial variant={screen.variant} onBack={() => setScreen(screen.from ?? { kind: 'home' })}
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

      <button className="feature-card" onClick={() => setScreen({ kind: 'rules' })}>
        <span className="feature-icon">📖</span>
        <span className="feature-text">
          <strong>{t('規則圖鑑', 'Rule encyclopedia')}</strong>
          <span className="muted small">{t(`認識各地象棋的 ${RULES.length} 條規則：蹩馬腿、打入、長捉、數步……每條都附出處，很多可以直接試玩。`,
            `Explore ${RULES.length} rules from chess games around the world — each with its source, many playable right away.`)}</span>
        </span>
        <span className="feature-arrow">›</span>
      </button>
      <button className="feature-card" onClick={() => setScreen({ kind: 'campaign' })}>
        <span className="feature-icon">⚔️</span>
        <span className="feature-text">
          <strong>{t('無盡征途', 'The Long March')}</strong>
          <span className="muted small">{t('單人模式：奪旗、軍團、最後將死國王。每關之後擴充領地、招募各國棋子。', 'Single player: capture flags, face legions, then checkmate the king. Grow your territory and recruit pieces between battles.')}</span>
        </span>
        <span className="feature-arrow">›</span>
      </button>
      <button className="feature-card" onClick={() => setScreen({ kind: 'mix' })}>
        <span className="feature-icon">🧩</span>
        <span className="feature-text">
          <strong>{t('自由組合', 'Mix & match')}</strong>
          <span className="muted small">{t('自選棋盤、雙方軍隊和規則開局，例如西洋棋軍對中國象棋軍。', 'Pick a board, an army for each side and any rules — e.g. a chess army against a xiangqi army.')}</span>
        </span>
        <span className="feature-arrow">›</span>
      </button>

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
