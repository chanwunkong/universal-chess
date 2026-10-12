// 通用棋類引擎的資料模型：每個變體 = 棋盤 + 棋子定義 + 規則。

export type Side = 0 | 1; // 0 = 下方先手（紅/白/先手），1 = 上方
export type Vec = [number, number]; // [dx, dy]，以棋子擁有者視角，dy > 0 為「前進」

/** 區域名稱（相對於棋子擁有者） */
export type RegionName = 'palace' | 'ownHalf' | 'enemyHalf' | 'promoZone';

export interface MoveRule {
  vectors: Vec[];
  /** 1 = 單步/跳躍一次；0 = 無限滑行；n = 最多滑行 n 次 */
  range: number;
  mode: 'both' | 'move' | 'capture';
  /** 跳躍型：cannon = 象棋炮（平移不吃、隔一子吃）；janggi = 韓國包（移動與吃子都需隔一子，不可跳過或吃同類） */
  hop?: 'cannon' | 'janggi';
  /** 蹩腳：跳躍路徑上的格子必須為空（馬腳、象眼） */
  lame?: boolean;
  /** 目標格必須在此區域內 */
  confine?: RegionName;
  /** 只有當棋子位於此區域時此走法才有效（如過河兵） */
  when?: RegionName;
  /** 只有未移動過的棋子才能使用 */
  initial?: boolean;
  /** 斜向移動只能沿九宮斜線 */
  palaceDiag?: boolean;
  /** 被將軍時不能使用（柬埔寨象棋王的第一步） */
  notInCheck?: boolean;
  /** 敵方這些棋子一旦走到本棋子所在的橫排或直線上，此走法永久失效（柬埔寨象棋：敵車） */
  lostIfEnemyOnLine?: string[];
}

export interface PieceDef {
  id: string;
  name: string;
  /** 兩方顯示文字 */
  labels: [string, string];
  /** 外觀：disc 圓形棋子、shogi 五角形、glyph 西洋棋符號、octagon 八角形 */
  style: 'disc' | 'shogi' | 'glyph' | 'octagon';
  moves: MoveRule[];
  royal?: boolean;
  value?: number;
  promotesTo?: string[];
  /** 進入升變區時必須升變（西洋棋兵）；否則為可選（將棋） */
  promoForced?: boolean;
  /** 若落點在最後 N 排則必須升變（將棋步兵/香車=1、桂馬=2），同時也限制打入 */
  mustPromoteDepth?: number;
  /** 被吃後回到手上時的原始類型（升變後的棋子） */
  demotesTo?: string;
  /** 兵類：移動時重置無吃子計數 */
  pawn?: boolean;
  /** 可吃過路兵，且雙步時產生過路兵格 */
  enPassant?: boolean;
  /** 可作為入堡的夥伴（城堡） */
  castlePartner?: boolean;
  /** 打入限制：同一直線不得有兩枚（二步） */
  nifu?: boolean;
  /** 打入限制：不得打入將死（打步詰） */
  noDropMate?: boolean;
  /** 計分（將棋持將棋：大駒 5、小駒 1） */
  points?: number;
  /** 判斷子力不足死局用（FIDE 5.2.2）：輕子種類 */
  minor?: 'knight' | 'bishop';
  /** 中國象棋長捉判定（AXF）中的兵種 */
  xqRole?: 'king' | 'advisor' | 'elephant' | 'horse' | 'rook' | 'cannon' | 'soldier';
  /** 泰國／柬埔寨數步規則中的身分 */
  countAs?: 'rook' | 'bishop' | 'knight' | 'queen';
}

export interface Palace {
  x: number;
  y: number;
  w: number;
  h: number;
  side: Side;
}

export interface BoardDef {
  width: number;
  height: number;
  /** square = 下在格子內；intersection = 下在交叉點 */
  cell: 'square' | 'intersection';
  checkered?: boolean;
  river?: boolean;
  palaces?: Palace[];
}

export interface RulesDef {
  /** checkmate = 將死；captureRoyal = 吃掉王（可以送王）；captureAll = 吃光對方 */
  win: 'checkmate' | 'captureRoyal' | 'captureAll';
  /** 無子可動（未被將軍）時：輪到的一方判負/判勝/和棋 */
  stalemate: 'loss' | 'win' | 'draw';
  promotionZone: number;
  drops?: boolean;
  castling?: boolean;
  flyingGeneral?: boolean;
  allowPass?: boolean;
  /** 光王判負：只剩王的一方輸；但若能在下一步也把對方吃到只剩王則和棋 */
  bareKing?: boolean;
  /** 數步規則（棋盤數／棋子數） */
  counting?: 'makruk' | 'cambodian';
  /** 將死時，若所有將軍的棋子都屬於這些類型，該步不合法（蒙古象棋：不能用馬將死） */
  noMateBy?: string[];
  /** 將死前的連續將軍中，至少要有一次由這些棋子將軍，否則和棋（蒙古象棋 shak 規則） */
  mateRequiresCheckBy?: string[];
  /** 任一方只剩王即和棋（蒙古象棋 Robado） */
  bareKingDraw?: boolean;
  /** 照面（빅장）：雙王同一直線無子相隔時，對方須破解或停著；停著則終局計分 */
  bikjang?: boolean;
  /** 以計分判定原本會和棋的結局（韓國象棋）；bonus 為雙方加分 */
  pointsAdjudication?: { bonus: [number, number] };
  /** 同一局面出現 N 次自動和棋，0 = 關閉 */
  repetition: number;
  /** 連續 N 個半回合無吃子（且無兵移動）自動和棋，0 = 關閉 */
  moveLimit: number;
  /** 同一局面出現 N 次時，輪走方可以要求和棋（FIDE 9.2） */
  repetitionClaim?: number;
  /** N 個半回合無吃子且無兵移動時，可以要求和棋（FIDE 9.3） */
  moveLimitClaim?: number;
  /** 子力不足、雙方都不可能將死時自動和棋（FIDE 5.2.2） */
  deadPosition?: boolean;
  /** 重複局面的過程中，一方每一步都在將軍時，該方判負 */
  perpetualCheckLoses?: boolean;
  /** 總手數（半回合）達到上限時判和（將棋 500 手持將棋）；若正在連續將軍則等將軍中斷 */
  maxPlies?: number;
  /** 亞洲象棋聯合會（AXF）長將、長捉規則，移植自 Fairy-Stockfish */
  chasing?: 'axf';
  /** 日本將棋聯盟的持將棋規則（合意 24 點、入玉宣言 31 點） */
  impasse?: 'jsa';
}

export interface Placement {
  type: string;
  side: Side;
  x: number;
  y: number;
}

/** 開局時讓玩家選擇部分棋子的擺法（韓國象棋馬象位置） */
export interface SetupChoice {
  /** 選擇順序（例如漢方先選） */
  order: Side[];
  /** 每個選項的擺放（以該方視角：x 由左至右、y 由己方底線起算） */
  options: { name: string; placements: { x: number; y: number; type: string }[] }[];
}

export interface VariantDef {
  id: string;
  name: string;
  description?: string;
  board: BoardDef;
  pieces: Record<string, PieceDef>;
  setup: Placement[];
  setupChoice?: SetupChoice;
  rules: RulesDef;
  sideNames: [string, string];
  sideColors: [string, string];
  custom?: boolean;
}

export interface Piece {
  type: string;
  side: Side;
  moved?: boolean;
  /** 某些第一步特權已永久失效 */
  lost?: boolean;
}

export interface Move {
  from: number; // -1 = 打入
  to: number;
  type: string; // 移動（或打入）的棋子類型
  capture?: Piece;
  promo?: string;
  ep?: number; // 吃過路兵時被吃的格子
  castle?: { from: number; to: number };
  pass?: boolean;
  /** 只有在未被將軍時才合法 */
  needNoCheck?: boolean;
}

export interface GameState {
  board: (Piece | null)[];
  turn: Side;
  hands: [Record<string, number>, Record<string, number>];
  ep: number; // 過路兵格，-1 表示無
  halfmoveClock: number;
  passes: number;
  /** 已走的總手數（半回合） */
  ply?: number;
  /** 產生這個局面的上一步（長捉判定用） */
  last?: { from: number; to: number; captured: boolean };
  /** 數步：limit / ply 皆以半回合計（對應 Fairy-Stockfish 的 countingLimit / countingPly） */
  count?: { limit: number; ply: number };
  /** 棋盤數：由劣勢方宣告，ply 從 1 起算 */
  boardCount?: { side: Side; ply: number };
}

export type Result =
  | { kind: 'ongoing'; check: boolean }
  | { kind: 'win'; winner: Side; reason: string }
  | { kind: 'draw'; reason: string };
