# 萬象棋盤

支援世界各地象棋的網頁遊戲，以手機遊玩為主：西洋棋、中國象棋、越南象棋、日本將棋、韓國象棋、蒙古象棋、泰國象棋、柬埔寨象棋、波斯象棋，並可自訂棋盤、棋子走法與規則。

**線上版**：https://chanwunkong.github.io/universal-chess/

## 開發

```bash
npm install
npm run dev      # 開發伺服器（區域網路內手機也能連）
npm test         # 規則引擎測試（perft 與各變體規則）
npm run build    # 建置到 docs/（GitHub Pages）
```

## 架構

- `src/engine/`：通用規則引擎。每個變體都是資料（棋盤＋棋子走法＋規則），由同一個引擎執行；AI 在 Web Worker 中執行。
- `src/variants/presets.ts`：各地區象棋的定義，規則出處註明在程式碼中。
- `src/ui/`：對局畫面與自訂編輯器。
