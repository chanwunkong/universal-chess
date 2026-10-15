import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PieceDef, Side, Text, VariantDef } from './engine/types';

export type Lang = 'zh' | 'en';
const KEY = 'universal-chess.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // 無法存取 localStorage 時使用瀏覽器語言
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'zh', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    try { localStorage.setItem(KEY, lang); } catch { /* 忽略 */ }
    document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en';
    document.title = lang === 'zh' ? '萬象棋盤' : 'Universal Chess';
  }, [lang]);
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  const { lang, setLang } = useContext(LangContext);
  const en = lang === 'en';
  return {
    lang,
    setLang,
    /** 介面文字：同時寫中文與英文，依語言回傳其一 */
    t: (zh: string, enText: string) => (en ? enText : zh),
    /** 引擎回傳的雙語文字 */
    tx: (x: Text | undefined) => (x ? x[lang] : ''),
    vName: (v: VariantDef) => (en ? v.nameEn ?? v.name : v.name),
    vDesc: (v: VariantDef) => (en ? v.descriptionEn ?? v.description : v.description) ?? '',
    side: (v: VariantDef, s: Side) => (en ? v.sideNamesEn?.[s] ?? v.sideNames[s] : v.sideNames[s]),
    pName: (p: PieceDef | undefined) => (p ? (en ? p.nameEn ?? p.name : p.name) : ''),
  };
}

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button className="lang-toggle" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
      aria-label={lang === 'zh' ? 'Switch to English' : '切換為中文'}>
      <span className={lang === 'zh' ? 'on' : ''}>中</span>
      <span className={lang === 'en' ? 'on' : ''}>EN</span>
    </button>
  );
}
