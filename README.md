# 萬象棋盤 Universal Chess

收集、介紹並遊玩世界各地象棋規則的網頁遊戲，以手機遊玩為主，介面可切換中文與英文。

**線上版**：https://chanwunkong.github.io/universal-chess/

> A mobile-first web game that collects, explains and plays chess rules from around the world. Every rule cites its source, and rules, boards and pieces can be mixed freely. The UI switches between Chinese and English.

## 核心理念

象棋類的變體多到數不完，所以本站以「規則」為核心，而不是以「棋種」為核心：

- 每一條規則（蹩馬腿、打入、長捉、數步、入堡……）都是一張可以獨立理解的**規則卡**。
- 西洋棋、中國象棋、將棋……只是事先組好的一套規則卡。
- 使用者先在**規則圖鑑**認識規則，再用**自由組合**挑選棋盤、軍隊與規則開局。

**規則來源原則：** 只實作有官方規則或國際通用規則的內容，不憑推測，也不簡化。每條規則都在程式註解與規則卡中註明出處；來源互相矛盾或不足時，先回報再決定。

## 功能

### 各地象棋（10 種）

| 棋種 | 規則依據 |
|---|---|
| 西洋棋 | FIDE 棋規（2023）：三次重複與 50 回合可要求和棋，五次重複與 75 回合自動和棋，子力不足判和 |
| 中國象棋 | 亞洲象棋聯合會（AXF）：長將、長捉判負，困斃判負 |
| 越南象棋 | 走法同中國象棋；越南協會條文未規定重複次數，長將長捉暫依 AXF |
| 日本將棋 | 日本將棋聯盟對局規則：二步、打步詰、千日手、連續王手千日手、持將棋（24 點）、入玉宣言（31 點）、500 手 |
| 韓國象棋 | 正式比賽規則：開局選擇馬象擺法、照面（빅장）、計分判定（漢加 1.5 分）、停著 |
| 蒙古象棋 | 傳統規則：不能只用馬將死、Niol、Robado（規則來自 Wikipedia 與 Fairy-Stockfish） |
| 泰國象棋 | 棋盤數與棋子數的數步規則 |
| 柬埔寨象棋 | 王與 Neang 的第一步特權、數步規則 |
| 緬甸象棋 | 開局佈陣、對角線升變、東協數步 |
| 波斯象棋 | 光王規則（史料整理，依 Wikipedia） |

每種棋都能本機雙人對戰或和電腦對下（三種難度），支援悔棋、翻轉棋盤、棋譜，以及各棋種特有的操作（停著、宣告數步、要求和棋、入玉宣言、提議持將棋、交換先後重下）。

### 規則圖鑑

- 52 張規則卡，分為棋盤、棋子走法、特殊棋子、升變、打入與佈陣、特殊走法、勝負、和局與裁決、開局九類。
- 每張卡都有雙語說明、出處連結，以及使用這條規則的棋種。
- 37 張是本站已實作的規則，其中 18 張附互動示範局面。
- 15 張是尚未實作的規則（揭棋、爆炸棋、雙棋盤、960 等），依 PyChess 規則說明撰寫並標示「只介紹」。

### 教學關卡

每種棋都有：
- **棋子走法：** 每種棋子一關，走法說明由規則資料自動產生；用最少步數走到所有星星。
- **一步殺謎題：** 每種棋 6 題，皆為唯一解，答案由引擎依該棋種規則判定。
- **實戰：** 一鍵和簡單難度的電腦對下。

### 自由組合

- 6 種棋盤 × 10 支軍隊，雙方軍隊可以不同。
- **混編軍隊：** 以任一軍隊為底，點棋子從棋子庫（約 75 種棋子）替換，或在己方陣地自由擺放；對手可鏡像或各自編隊。
- 規則卡自由增減，也可一鍵套用任一棋種的整套規則；規則衝突或無效時會提示。
- 混入的棋子保留各自棋種的升變區；用到的棋子會自動帶入升變與降級後的棋子。

### 自訂編輯器

可從頭設計棋盤（尺寸、交叉點、河界、九宮）、棋子（在格子圖上點選走法方向，設定滑行、跳躍、蹩腳、跳子、區域限制、升變等）、擺子與全部規則。自訂變體存在瀏覽器中，可匯出、匯入 JSON。

## 驗證方式

規則引擎以 [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)（PyChess 使用的規則引擎）作為對照：

- **perft：** 從開局展開數層所有合法走法，節點數與 Fairy-Stockfish 一致（西洋棋、中國象棋、將棋、韓國象棋、蒙古、泰國、柬埔寨、緬甸、波斯象棋）。
- **隨機對局比對：** 每種棋隨機下完數百局，每一步比對合法走法數量與終局裁決，共數十萬個局面一致，包括長捉、長將、照面計分、Niol、數步上限等。
- **刻意的差異：** 「不允許的將死」（打步詰、只用馬將死）在 Fairy-Stockfish 是可以走但判負，本站直接不讓走；西洋棋子力不足與波斯象棋雙方光王，本站依 FIDE 與史料判和。

`npm test` 會執行 perft、各變體規則情境、教學關卡、規則卡示範與自由組合的測試。

## 開發

```bash
npm install
npm run dev      # 開發伺服器（區域網路內的手機也能連）
npm test         # 測試
npm run build    # 建置到 docs/（GitHub Pages 從 main 分支的 docs/ 發布）
```

重新產生一步殺謎題：

```bash
GEN=1 npx vitest run src/tutorial/gen-puzzles.test.ts
```

## 程式架構

```
src/
  engine/           規則引擎
    types.ts        資料模型：棋盤、棋子走法規則、規則旗標、局面
    engine.ts       走法生成、合法性、將軍、升變、打入、數步、和棋與勝負判定
    xqchase.ts      中國象棋 AXF 長將長捉判定（移植自 Fairy-Stockfish）
    ai.ts           通用 AI：迭代加深 alpha-beta + 吃子靜態搜尋
    ai.worker.ts    AI 在 Web Worker 中執行
  variants/
    presets.ts      各地象棋的定義（規則出處註明在程式碼中）與英文名稱
  rules/
    catalog.ts      規則圖鑑的規則卡、出處與示範局面
    demo.ts         示範局面的建立工具
  tutorial/
    describe.ts     由走法資料自動產生棋子說明
    lessons.ts      教學關卡產生與進度儲存
    puzzles.json    預先產生的一步殺謎題
  mix/
    build.ts        自由組合：棋盤、混編軍隊與規則組成可下的變體
  ui/               畫面元件（對局、教學、規則圖鑑、自由組合、編輯器）
  i18n.tsx          中英切換
design/             設計文件
```

**設計重點：** 每個變體都是資料（棋盤 + 棋子定義 + 規則旗標），由同一個引擎執行。新增棋種或規則時，優先擴充資料與通用機制，而不是為單一棋種寫特例。

## 開發中：無盡征途（單人模式）

單人 roguelite 模式：從小棋盤出發，三幕共 9 關（奪旗 → 軍團 → 王），每關後用戰功擴充俄羅斯方塊形狀的領地、招募各國棋子與規則卡，輸一局就結束整輪。分為兩種難度：簡單模式被吃掉的棋子每關復活，困難模式被吃掉就永久消失。詳見 [design/campaign.md](design/campaign.md)。

## 規則來源

- [FIDE Laws of Chess (2023)](https://handbook.fide.com/chapter/E012023)
- [日本将棋連盟 対局規則](https://www.shogi.or.jp/match/taikyoku_rules/)
- [PyChess 變體規則說明](https://www.pychess.org/variants)
- [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish)
- [越南象棋裁判培訓教材（2015）](https://zigavn.com/base/luat_co_tuong.pdf)
- Wikipedia：Xiangqi、Shogi、Shatranj、Shatar、Makruk 等條目
