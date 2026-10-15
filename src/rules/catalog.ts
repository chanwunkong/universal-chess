// 規則圖鑑：每條規則一張卡。playable = 引擎已實作並驗證；info = 只介紹、尚未開放試玩。
// 每張卡都附出處；說明文字依出處撰寫，不自行推測。
import type { RulesDef, Side, Text } from '../engine/types';

const L = (zh: string, en: string): Text => ({ zh, en });

export type Category = 'board' | 'move' | 'promotion' | 'drop' | 'special' | 'win' | 'draw' | 'opening' | 'piece';

export const CATEGORIES: { id: Category; name: Text }[] = [
  { id: 'board', name: L('棋盤', 'Board') },
  { id: 'move', name: L('棋子走法', 'Movement') },
  { id: 'piece', name: L('特殊棋子', 'Special pieces') },
  { id: 'promotion', name: L('升變', 'Promotion') },
  { id: 'drop', name: L('打入與佈陣', 'Drops & placement') },
  { id: 'special', name: L('特殊走法', 'Special moves') },
  { id: 'win', name: L('勝負', 'Winning') },
  { id: 'draw', name: L('和局與裁決', 'Draws & rulings') },
  { id: 'opening', name: L('開局', 'Opening') },
];

export interface Source {
  label: string;
  url: string;
}

/** 互動示範：在某棋種的棋盤上擺出局面，讓使用者試走 */
export interface Demo {
  /** 借用哪個棋種的棋盤與棋子 */
  base: string;
  /** [棋子, 方, 格子]，格子用 a1 這種寫法 */
  pieces: [string, Side, string][];
  hands?: [Record<string, number>, Record<string, number>];
  turn?: Side;
  /** 過路兵格 */
  ep?: string;
  rules?: Partial<RulesDef>;
  task: Text;
  /** 完成任務的走法：'b1d2'，打入寫成 's.b@e5'；沒有就是自由試走 */
  accept?: string[];
  /** 測試用：這些走法必須不合法 */
  illegal?: string[];
  done: Text;
}

export interface RuleCard {
  id: string;
  category: Category;
  status: 'playable' | 'info';
  name: Text;
  summary: Text;
  details?: Text[];
  /** 使用此規則、本站可玩的棋種 id */
  games?: string[];
  /** 其他使用此規則的棋（本站尚未收錄） */
  others?: string[];
  sources: Source[];
  demo?: Demo;
}

const S = {
  fide: { label: 'FIDE Laws of Chess (2023)', url: 'https://handbook.fide.com/chapter/E012023' },
  chessRules: { label: 'Wikipedia: Rules of chess', url: 'https://en.wikipedia.org/wiki/Rules_of_chess' },
  xiangqi: { label: 'Wikipedia: Xiangqi', url: 'https://en.wikipedia.org/wiki/Xiangqi' },
  janggi: { label: 'PyChess: Janggi', url: 'https://www.pychess.org/variants/janggi' },
  shogi: { label: 'Wikipedia: Shogi', url: 'https://en.wikipedia.org/wiki/Shogi' },
  jsa: { label: '日本将棋連盟 対局規則', url: 'https://www.shogi.or.jp/match/taikyoku_rules/' },
  makruk: { label: 'PyChess: Makruk', url: 'https://www.pychess.org/variants/makruk' },
  ouk: { label: 'PyChess: Ouk Chaktrang', url: 'https://www.pychess.org/variants/cambodian' },
  sittuyin: { label: 'PyChess: Sittuyin', url: 'https://www.pychess.org/variants/sittuyin' },
  shatranj: { label: 'Wikipedia: Shatranj', url: 'https://en.wikipedia.org/wiki/Shatranj' },
  shatar: { label: 'Wikipedia: Shatar', url: 'https://en.wikipedia.org/wiki/Shatar' },
  fsf: { label: 'Fairy-Stockfish', url: 'https://github.com/fairy-stockfish/Fairy-Stockfish' },
  vn: { label: 'Luật Cờ Tướng (tài liệu tập huấn trọng tài 2015)', url: 'https://zigavn.com/base/luat_co_tuong.pdf' },
  py: (slug: string, name: string): Source => ({ label: `PyChess: ${name}`, url: `https://www.pychess.org/variants/${slug}` }),
};

export const RULES: RuleCard[] = [
  // ---------------- 棋盤 ----------------
  {
    id: 'board.intersection', category: 'board', status: 'playable',
    name: L('下在交叉點', 'Playing on intersections'),
    summary: L('棋子放在線與線的交叉點上，而不是格子裡。', 'Pieces stand on the points where lines cross, not inside squares.'),
    details: [L('中國象棋與韓國象棋的棋盤是 9 條直線 × 10 條橫線。', 'Xiangqi and janggi boards have 9 files and 10 ranks of lines.')],
    games: ['xiangqi', 'cotuong', 'janggi'], sources: [S.xiangqi, S.janggi],
  },
  {
    id: 'board.river', category: 'board', status: 'playable',
    name: L('河界', 'The river'),
    summary: L('棋盤中間的「楚河漢界」把雙方分開：象不能過河，兵過河後才能橫走。', 'The river splits the board: elephants may not cross it, and soldiers gain sideways moves once across.'),
    games: ['xiangqi', 'cotuong'], sources: [S.xiangqi],
    demo: {
      base: 'xiangqi', pieces: [['x.e', 0, 'g5'], ['x.k', 0, 'e1'], ['x.k', 1, 'd10']],
      task: L('相站在河邊。點一下相，看看它能走去哪裡——河對岸的格子都不能去。', 'The elephant stands at the river. Tap it: none of the squares across the river are available.'),
      illegal: ['g5e7', 'g5i7'], accept: ['g5e3', 'g5i3'],
      done: L('沒錯，相只能在己方半場活動。', 'Right: the elephant stays on its own side.'),
    },
  },
  {
    id: 'board.palace', category: 'board', status: 'playable',
    name: L('九宮', 'The palace'),
    summary: L('雙方底部中央 3×3 的區域。將帥和士只能在九宮裡走。', 'The 3×3 area at each side’s centre. The general and the advisors may not leave it.'),
    games: ['xiangqi', 'cotuong', 'janggi'], sources: [S.xiangqi, S.janggi],
    demo: {
      base: 'xiangqi', pieces: [['x.k', 0, 'f2'], ['x.k', 1, 'd10']],
      task: L('帥在九宮右邊。它往右一步就會走出九宮，所以不行。把帥往上走一步。', 'The general is on the palace’s right edge, so it cannot step right. Move it up one point.'),
      illegal: ['f2g2'], accept: ['f2f3'],
      done: L('帥永遠留在九宮裡。', 'The general always stays in the palace.'),
    },
  },
  {
    id: 'board.palaceLines', category: 'board', status: 'playable',
    name: L('九宮斜線', 'Palace diagonals'),
    summary: L('韓國象棋的九宮畫有斜線，棋子可以沿斜線走（車、包、將、士、兵都可以）。', 'In janggi, pieces may move along the palace’s diagonal lines (chariots, cannons, generals, guards and soldiers).'),
    games: ['janggi'], sources: [S.janggi, S.fsf],
    demo: {
      base: 'janggi', pieces: [['j.r', 0, 'd1'], ['j.k', 0, 'f1'], ['j.k', 1, 'd9']],
      task: L('車在九宮角落。沿著斜線走到對角的 f3。', 'The chariot is in a palace corner. Slide it along the diagonal to f3.'),
      accept: ['d1f3'],
      done: L('在九宮裡，車可以沿斜線滑行。', 'Inside the palace, the chariot can slide along the diagonals.'),
    },
  },
  {
    id: 'board.promoZone', category: 'board', status: 'playable',
    name: L('升變區', 'Promotion zone'),
    summary: L('進入對方陣地的特定區域時棋子可以或必須升變：西洋棋是最後一排，將棋是最後三排，泰國象棋的兵是第六排。', 'Pieces may or must promote on reaching an area of the enemy camp: the last rank in chess, the last three ranks in shogi, the sixth rank for makruk pawns.'),
    games: ['chess', 'shogi', 'makruk', 'ouk', 'shatranj', 'shatar'], sources: [S.chessRules, S.shogi, S.makruk],
  },

  // ---------------- 棋子走法 ----------------
  {
    id: 'move.lame', category: 'move', status: 'playable',
    name: L('蹩腳（馬腳、象眼）', 'Blockable leaps (horse leg, elephant eye)'),
    summary: L('象棋的馬先直走一格再斜走一格；如果直走的那一格有棋子，就不能走（蹩馬腿）。象的「田」字中心被擋住也不能走（塞象眼）。', 'A xiangqi horse moves one point straight then one diagonally; if the straight point is occupied it cannot go that way. The elephant is blocked the same way at the centre of its move.'),
    games: ['xiangqi', 'cotuong', 'janggi'], sources: [S.xiangqi, S.janggi],
    demo: {
      base: 'xiangqi', pieces: [['x.h', 0, 'b1'], ['x.p', 0, 'b2'], ['x.k', 0, 'e1'], ['x.k', 1, 'd10']],
      task: L('馬的正前方有兵擋著，所以往前的兩個「日」字都不能跳。找出還能走的那一步。', 'A soldier blocks the horse’s leg, so both forward L-moves are impossible. Find the move that is still allowed.'),
      illegal: ['b1a3', 'b1c3'], accept: ['b1d2'],
      done: L('對！往右的那一腳沒有被擋，所以可以跳到 d2。', 'Yes: the rightward leg is free, so the horse can reach d2.'),
    },
  },
  {
    id: 'move.cannon', category: 'move', status: 'playable',
    name: L('炮：隔子吃', 'Cannon: capture by jumping'),
    summary: L('中國象棋的炮平常像車一樣直走，但吃子時中間必須正好隔一枚棋子（炮架）。', 'The xiangqi cannon moves like a chariot, but to capture it must jump over exactly one piece (the screen).'),
    games: ['xiangqi', 'cotuong'], sources: [S.xiangqi],
    demo: {
      base: 'xiangqi', pieces: [['x.c', 0, 'b3'], ['x.p', 0, 'b5'], ['x.r', 1, 'b8'], ['x.k', 0, 'e1'], ['x.k', 1, 'd10']],
      task: L('用炮隔著自己的兵，吃掉對方的車。', 'Use your soldier as a screen and capture the enemy chariot with the cannon.'),
      accept: ['b3b8'], illegal: ['b3b5'],
      done: L('炮隔著一枚棋子才能吃。', 'The cannon captures over exactly one piece.'),
    },
  },
  {
    id: 'move.janggiCannon', category: 'move', status: 'playable',
    name: L('包：一定要跳子', 'Janggi cannon: always jumps'),
    summary: L('韓國象棋的包不論移動或吃子，都必須跳過正好一枚棋子；而且不能跳過包、也不能吃包。', 'The janggi cannon must jump over exactly one piece both to move and to capture, and may neither jump over nor capture another cannon.'),
    games: ['janggi'], sources: [S.janggi],
    demo: {
      base: 'janggi', pieces: [['j.c', 0, 'b3'], ['j.p', 0, 'b4'], ['j.k', 0, 'e2'], ['j.k', 1, 'd9']],
      task: L('包下面沒有棋子可跳，所以不能往下走。跳過前面的兵，走到 b6。', 'With nothing to jump below it, the cannon cannot move down. Jump over the soldier to b6.'),
      accept: ['b3b6'], illegal: ['b3b2'],
      done: L('包一定要跳過一枚棋子才能移動。', 'The cannon always needs a piece to jump over.'),
    },
  },
  {
    id: 'move.riverSoldier', category: 'move', status: 'playable',
    name: L('過河兵', 'Soldiers across the river'),
    summary: L('中國象棋的兵只能向前走一步；過河之後多了左右橫走。兵永遠不能後退。', 'A xiangqi soldier steps forward only; once across the river it may also step sideways. It never moves backwards.'),
    games: ['xiangqi', 'cotuong'], sources: [S.xiangqi],
    demo: {
      base: 'xiangqi', pieces: [['x.p', 0, 'c4'], ['x.p', 0, 'g6'], ['x.k', 0, 'e1'], ['x.k', 1, 'd10']],
      task: L('左邊的兵還沒過河，只能往前；右邊的兵已過河。讓過河的兵往旁邊走一步。', 'The left soldier has not crossed and can only go forward; the right one has. Move the crossed soldier sideways.'),
      accept: ['g6f6', 'g6h6'], illegal: ['c4b4', 'c4d4', 'g6g5'],
      done: L('過河後，兵可以橫走。', 'Across the river, soldiers may step sideways.'),
    },
  },
  {
    id: 'move.pawnDouble', category: 'move', status: 'playable',
    name: L('兵第一步可走兩格', 'Pawn double step'),
    summary: L('西洋棋的兵第一次移動時可以直走兩格（途中不能被擋）。泰國、緬甸、波斯、蒙古象棋的兵都沒有這條規則。', 'A chess pawn may advance two squares on its first move if both are empty. Makruk, sittuyin, shatranj and shatar pawns have no double step.'),
    games: ['chess'], sources: [S.fide],
    demo: {
      base: 'chess', pieces: [['c.p', 0, 'e2'], ['c.k', 0, 'e1'], ['c.k', 1, 'e8']],
      task: L('讓兵一次前進兩格。', 'Advance the pawn two squares.'),
      accept: ['e2e4'], done: L('只有第一步可以這樣走。', 'Only on its first move.'),
    },
  },
  {
    id: 'move.firstMoveSpecial', category: 'move', status: 'playable',
    name: L('第一步特殊走法（柬埔寨）', 'Special first moves (Cambodia)'),
    summary: L('柬埔寨象棋的王第一步可以跳馬步到前一排（不能吃子、被將軍時不行），敵方的車一旦走到王的橫排或直線上，這個權利就永久失效；Neang 第一步可以直跳兩格。', 'In ouk chatrang the king’s first move may be a knight leap to the next rank (no capture, not in check), lost for good once an enemy rook reaches its rank or file; the neang may jump two squares forward on its first move.'),
    games: ['ouk'], sources: [S.ouk, S.fsf],
    demo: {
      base: 'ouk', pieces: [['o.k', 0, 'd1'], ['o.m', 0, 'e1'], ['o.k', 1, 'e8']],
      task: L('讓王用馬步跳到前一排。', 'Let the king leap like a knight to the next rank.'),
      accept: ['d1b2', 'd1f2'],
      done: L('王的馬步只有第一步可以用。', 'The king’s leap is only available on its first move.'),
    },
  },

  // ---------------- 特殊棋子 ----------------
  {
    id: 'piece.compound', category: 'piece', status: 'playable',
    name: L('複合棋子', 'Compound pieces'),
    summary: L('把兩、三種棋子的走法合在一起。例如 S-Chess 的鷹（象＋馬）與象（車＋馬）、Grand Chess 的元帥（車＋馬）與樞機（象＋馬）、滿洲棋的「旗」（車＋炮＋馬）。在本站的自訂編輯器可以自己組合。', 'Pieces that combine two or three movements, such as S-Chess’s hawk (bishop+knight) and elephant (rook+knight), Grand Chess’s marshal and cardinal, or Manchu chess’s banner (chariot+cannon+horse). You can build them in the custom editor.'),
    others: ['S-Chess', 'Grand Chess', 'Capablanca', 'Manchu+'],
    sources: [S.py('seirawan', 'S-Chess'), S.py('grand', 'Grand'), S.py('manchu', 'Manchu+')],
  },
  {
    id: 'piece.twoRoyals', category: 'piece', status: 'info',
    name: L('兩個王', 'Two royal pieces'),
    summary: L('小將棋的醉象升變成「太子」後等於第二個王，必須也被吃掉才算贏。Spartan Chess 的斯巴達方有兩個王，不能讓兩個王同時被攻擊。', 'In sho shogi the drunk elephant promotes to a crown prince that acts as a second king and must also be captured. In Spartan Chess the Spartans have two kings and may never leave both under attack.'),
    others: ['Sho Shogi', 'Spartan Chess'], sources: [S.py('shoshogi', 'Sho Shogi'), S.py('spartan', 'Spartan')],
  },
  {
    id: 'piece.asymmetric', category: 'piece', status: 'info',
    name: L('左右不對稱的棋子', 'Left/right mirror pieces'),
    summary: L('禽將棋的左鶉與右鶉是兩種不同的棋子，走法互為鏡像。', 'Tori shogi has a Left Quail and a Right Quail whose moves are mirror images of each other.'),
    others: ['Tori Shogi'], sources: [S.py('torishogi', 'Tori Shogi')],
  },
  {
    id: 'piece.flip', category: 'piece', status: 'info',
    name: L('走完就翻面', 'Flipping after every move'),
    summary: L('京都將棋（5×5）的棋子（王除外）每走一步都必須翻面，變成另一種棋子；打入時可以選擇用哪一面。', 'In Kyoto shogi (5×5) every piece except the king must flip to its other side after moving; when dropping you may choose either side.'),
    others: ['Kyoto Shogi'], sources: [S.py('kyotoshogi', 'Kyoto Shogi')],
  },
  {
    id: 'piece.hidden', category: 'piece', status: 'info',
    name: L('蓋著的棋子（揭棋）', 'Hidden pieces (Jieqi)'),
    summary: L('揭棋開局時除了將帥，其餘棋子都蓋著並隨機擺放；蓋著的棋子第一步依所在位置原本棋子的走法走，走完翻開，之後依真正身分走。', 'In Jieqi all pieces except the kings start face down in random positions; a hidden piece first moves as the piece whose starting square it occupies, is then revealed, and from then on moves as its real type.'),
    others: ['Jieqi'], sources: [S.py('jieqi', 'Jieqi')],
  },

  // ---------------- 升變 ----------------
  {
    id: 'promo.choice', category: 'promotion', status: 'playable',
    name: L('可選擇升變', 'Optional promotion'),
    summary: L('將棋的棋子走進、走出或在敵陣三排內移動時可以選擇升變；但若不升變就再也動不了（步兵、香車在最後一排，桂馬在最後兩排），就必須升變。', 'Shogi pieces may promote when moving into, within or out of the last three ranks, but must promote if they could otherwise never move again (pawn and lance on the last rank, knight on the last two).'),
    games: ['shogi'], sources: [S.shogi, S.jsa],
    demo: {
      base: 'shogi', pieces: [['s.s', 0, 'e6'], ['s.k', 0, 'e1'], ['s.k', 1, 'a9']],
      task: L('讓銀將往前走進敵陣，你可以選擇升變或不升變。', 'Move the silver forward into the enemy camp — you may choose whether to promote.'),
      accept: ['e6e7'], done: L('進入敵陣時可以自己決定要不要升變。', 'On entering the camp, promotion is your choice.'),
    },
  },
  {
    id: 'promo.forced', category: 'promotion', status: 'playable',
    name: L('強制升變', 'Compulsory promotion'),
    summary: L('西洋棋的兵走到最後一排必須升變為后、車、象或馬；泰國、柬埔寨、蒙古、波斯象棋的兵只能升變為一種棋子。', 'A chess pawn reaching the last rank must promote to a queen, rook, bishop or knight; in makruk, ouk, shatar and shatranj the pawn has only one promotion choice.'),
    games: ['chess', 'makruk', 'ouk', 'shatar', 'shatranj'], sources: [S.fide, S.makruk, S.shatranj],
    demo: {
      base: 'chess', pieces: [['c.p', 0, 'a7'], ['c.k', 0, 'e1'], ['c.k', 1, 'h6']],
      task: L('讓兵走到最後一排，並選一種棋子升變。', 'Push the pawn to the last rank and choose its promotion.'),
      accept: ['a7a8'], done: L('兵一定要升變，但可以選擇變成哪一種。', 'The pawn must promote, but you choose what into.'),
    },
  },
  {
    id: 'promo.sittuyin', category: 'promotion', status: 'playable',
    name: L('對角線升變（緬甸）', 'Diagonal promotion (Burma)'),
    summary: L('緬甸象棋的兵走到對方半場的長對角線上之後，可以在原地或斜一格升變為將軍；但同時只能有一位將軍，升變不能吃子、不能攻擊敵子，也不能將軍。只剩一個兵時可以在任何位置升變。', 'In sittuyin a pawn on the opponent’s half of the long diagonals may promote to a general in place or one step diagonally, only if its side has no general, and the promotion may not capture, attack an enemy piece or give check. A last remaining pawn may promote anywhere.'),
    games: ['sittuyin'], sources: [S.sittuyin, S.fsf],
    demo: {
      base: 'sittuyin', pieces: [['y.p', 0, 'd5'], ['y.k', 0, 'a1'], ['y.k', 1, 'h8']],
      task: L('兵已經在升變線上。讓它原地升變為將軍（點兵，再點它自己所在的格子）。', 'The pawn is on the promotion diagonal. Promote it in place (tap the pawn, then its own square).'),
      accept: ['d5d5', 'd5c6', 'd5e6', 'd5c4', 'd5e4'],
      done: L('升變本身就是一步棋。', 'Promotion counts as a move of its own.'),
    },
  },
  {
    id: 'promo.revert', category: 'promotion', status: 'playable',
    name: L('被吃後恢復原狀', 'Promoted pieces revert'),
    summary: L('將棋升變過的棋子被吃掉後，會以未升變的樣子進入對方手中。Crazyhouse 的升變兵被吃後也是以兵的身分打入。', 'A promoted shogi piece goes to the captor’s hand unpromoted; in Crazyhouse a captured promoted pawn is dropped as a pawn.'),
    games: ['shogi'], others: ['Crazyhouse'], sources: [S.shogi, S.py('crazyhouse', 'Crazyhouse')],
  },

  // ---------------- 打入與佈陣 ----------------
  {
    id: 'drop.basic', category: 'drop', status: 'playable',
    name: L('打入', 'Drops'),
    summary: L('吃掉的棋子成為自己的「持駒」，之後可以用一步棋把它放到棋盤的空格上。將棋與 Crazyhouse 使用這條規則。', 'Captured pieces join your hand and can later be placed on any empty square as a move. Used in shogi and Crazyhouse.'),
    games: ['shogi'], others: ['Crazyhouse', 'Bughouse'], sources: [S.shogi, S.py('crazyhouse', 'Crazyhouse')],
    demo: {
      base: 'shogi', pieces: [['s.k', 0, 'e1'], ['s.k', 1, 'e9']], hands: [{ 's.b': 1 }, {}],
      task: L('你手上有一枚角。點它，再點棋盤上的 e5，把它打入。', 'You hold a bishop. Tap it, then tap e5 to drop it.'),
      accept: ['s.b@e5'], done: L('打入算一步棋。', 'A drop is a move.'),
    },
  },
  {
    id: 'drop.nifu', category: 'drop', status: 'playable',
    name: L('二步', 'Nifu (two pawns)'),
    summary: L('將棋不能把步兵打入已經有自己未升變步兵的直線上。', 'In shogi you may not drop a pawn on a file that already holds one of your unpromoted pawns.'),
    games: ['shogi'], sources: [S.jsa],
    demo: {
      base: 'shogi', pieces: [['s.p', 0, 'e3'], ['s.k', 0, 'a1'], ['s.k', 1, 'i9']], hands: [{ 's.p': 1 }, {}],
      task: L('e 筋已經有你的步兵，所以 e 筋的格子都不能打。把手上的步打在 d5。', 'The e-file already has your pawn, so you cannot drop there. Drop your pawn on d5.'),
      accept: ['s.p@d5'], illegal: ['s.p@e5'],
      done: L('同一直線不能有兩枚自己的步兵。', 'Never two of your pawns on one file.'),
    },
  },
  {
    id: 'drop.uchifuzume', category: 'drop', status: 'playable',
    name: L('打步詰', 'Uchifuzume (pawn-drop mate)'),
    summary: L('將棋不能用「打入步兵」直接將死對方。用走的步兵將死可以，打入其他棋子將死也可以。', 'In shogi you may not checkmate by dropping a pawn. Mating with a moved pawn, or by dropping another piece, is fine.'),
    games: ['shogi'], sources: [S.jsa],
    demo: {
      base: 'shogi',
      pieces: [['s.g', 0, 'b7'], ['s.k', 0, 'e1'], ['s.k', 1, 'a9'], ['s.l', 1, 'b9']], hands: [{ 's.p': 1 }, {}],
      task: L('把步打在 a8 會直接將死對方，所以這一格不能打。試試看，然後把步打在其他地方。', 'Dropping the pawn on a8 would mate, so that square is forbidden. Check it, then drop the pawn somewhere else.'),
      illegal: ['s.p@a8'], accept: ['s.p@c5', 's.p@d5', 's.p@e5', 's.p@f5', 's.p@g5'],
      done: L('打步詰是犯規。', 'A pawn-drop mate is illegal.'),
    },
  },
  {
    id: 'drop.deploy', category: 'drop', status: 'playable',
    name: L('開局佈陣', 'Placement phase'),
    summary: L('開局時部分棋子在手上，雙方輪流把它們擺進己方陣地，擺完才開始走棋。緬甸象棋是兵以外的棋子擺進己方前三排（車只能擺在底線）；Placement 是雙方輪流擺西洋棋的底線。', 'Some pieces start in hand and players take turns placing them in their own camp before play begins. In sittuyin everything but the pawns goes into the first three ranks (chariots on the back rank); in Placement chess the players place their back ranks.'),
    games: ['sittuyin'], others: ['Placement'], sources: [S.sittuyin, S.py('placement', 'Placement')],
  },

  // ---------------- 特殊走法 ----------------
  {
    id: 'special.castling', category: 'special', status: 'playable',
    name: L('入堡', 'Castling'),
    summary: L('西洋棋的王與一個城堡都沒動過、中間沒有棋子、王沒被將軍、王經過與到達的格子都不被攻擊時，王可以往城堡方向走兩格，城堡跳到王的另一邊。', 'If the chess king and a rook have not moved, the squares between are empty, the king is not in check and does not pass through or land on an attacked square, the king moves two squares towards the rook and the rook jumps to its other side.'),
    games: ['chess'], sources: [S.fide],
    demo: {
      base: 'chess', pieces: [['c.k', 0, 'e1'], ['c.r', 0, 'h1'], ['c.r', 0, 'a1'], ['c.k', 1, 'e8']],
      task: L('點王，往左或往右走兩格完成入堡。', 'Tap the king and move it two squares left or right to castle.'),
      accept: ['e1g1', 'e1c1'], done: L('入堡是唯一一次同時移動兩枚棋子。', 'Castling is the only move that moves two pieces.'),
    },
  },
  {
    id: 'special.enPassant', category: 'special', status: 'playable',
    name: L('吃過路兵', 'En passant'),
    summary: L('對方的兵從起點直走兩格、剛好停在你的兵旁邊時，下一步你可以把它當成只走了一格來吃掉。只能在緊接的那一步做。', 'When an enemy pawn advances two squares and lands beside your pawn, on the very next move you may capture it as if it had moved one square.'),
    games: ['chess'], sources: [S.fide],
    demo: {
      base: 'chess', pieces: [['c.p', 0, 'e5'], ['c.p', 1, 'd5'], ['c.k', 0, 'g1'], ['c.k', 1, 'g8']], ep: 'd6',
      task: L('黑兵剛從 d7 走兩格到 d5。用 e5 的兵斜走到 d6，吃掉它。', 'Black’s pawn just moved d7–d5. Capture it en passant by moving to d6.'),
      accept: ['e5d6'], done: L('吃過路兵只能在對方走完的下一步立刻進行。', 'En passant is only possible immediately.'),
    },
  },
  {
    id: 'special.pass', category: 'special', status: 'playable',
    name: L('停著', 'Passing'),
    summary: L('韓國象棋可以選擇這一步不走（被將軍時不行，照面時例外）。因此韓國象棋不會發生困斃。', 'In janggi you may pass instead of moving (not while in check, except during bikjang), so stalemate cannot happen.'),
    games: ['janggi'], sources: [S.janggi],
  },
  {
    id: 'special.gating', category: 'special', status: 'info',
    name: L('落子入場（Gating）', 'Gating'),
    summary: L('S-Chess 的鷹與象一開始在場外。底線棋子第一次離開原位時，可以選擇把鷹或象放進剛空出來的格子。', 'In S-Chess the hawk and elephant start off the board; when a back-rank piece first moves, one of them may enter the square it left.'),
    others: ['S-Chess'], sources: [S.py('seirawan', 'S-Chess')],
  },
  {
    id: 'special.duck', category: 'special', status: 'info',
    name: L('鴨子擋路', 'The duck'),
    summary: L('Duck Chess 的雙方共用一隻鴨子。每一回合先走一步棋，再把鴨子移到任一空格擋路；吃掉對方的王就贏。', 'In Duck Chess both players share a duck: each turn you make a move and then move the duck to any empty square. Capturing the king wins.'),
    others: ['Duck Chess'], sources: [S.py('duck', 'Duck Chess')],
  },
  {
    id: 'special.atomic', category: 'special', status: 'info',
    name: L('爆炸', 'Explosions'),
    summary: L('Atomic 的每次吃子都會爆炸：被吃的棋子、吃子的棋子，以及周圍一格內的所有棋子（兵除外）都會移除；炸掉對方的王就贏。', 'In Atomic every capture explodes, removing the captured piece, the capturer and every adjacent piece except pawns; blowing up the enemy king wins.'),
    others: ['Atomic'], sources: [S.py('atomic', 'Atomic')],
  },
  {
    id: 'special.twoBoards', category: 'special', status: 'info',
    name: L('兩個棋盤', 'Two boards'),
    summary: L('Alice Chess 用兩個棋盤，棋子走完後移到另一個棋盤的對應格；Bughouse 是四人兩盤，吃到的子交給隊友打入。', 'Alice Chess uses two boards and each moved piece transfers to the other board; Bughouse is four players on two boards, passing captured pieces to the partner to drop.'),
    others: ['Alice Chess', 'Bughouse'], sources: [S.py('alice', 'Alice Chess'), S.py('bughouse', 'Bughouse')],
  },
  {
    id: 'special.fog', category: 'special', status: 'info',
    name: L('戰爭迷霧', 'Fog of war'),
    summary: L('Fog of War 只看得到自己的棋子和它們能走到的格子；沒有將軍，吃掉對方的王才結束。', 'In Fog of War you see only your pieces and the squares they can move to; there is no check, and the game ends when a king is captured.'),
    others: ['Fog of War'], sources: [S.py('fogofwar', 'Fog of War')],
  },

  // ---------------- 勝負 ----------------
  {
    id: 'win.checkmate', category: 'win', status: 'playable',
    name: L('將死', 'Checkmate'),
    summary: L('王被攻擊而且無論怎麼走都擋不住，就輸了。幾乎所有象棋類都以此分勝負。', 'A king that is attacked and cannot escape by any move is checkmated, and its side loses. Almost every chess-family game uses it.'),
    games: ['chess', 'xiangqi', 'cotuong', 'shogi', 'janggi', 'shatar', 'makruk', 'ouk', 'sittuyin', 'shatranj'], sources: [S.chessRules, S.xiangqi],
  },
  {
    id: 'win.stalemate', category: 'win', status: 'playable',
    name: L('困斃（無子可動）', 'Stalemate'),
    summary: L('沒被將軍但無棋可走。西洋棋、泰國、柬埔寨、緬甸、蒙古象棋判和；中國象棋與將棋是無法走的一方輸；波斯象棋則是讓對方困斃的一方贏。', 'Not in check but no legal move: a draw in chess, makruk, ouk, sittuyin and shatar; a loss for the stalemated side in xiangqi and shogi; and a win for the stalemating player in shatranj.'),
    games: ['chess', 'xiangqi', 'shogi', 'makruk', 'shatranj'], sources: [S.fide, S.xiangqi, S.shatranj],
  },
  {
    id: 'win.flyingGeneral', category: 'win', status: 'playable',
    name: L('王不見王', 'Flying general'),
    summary: L('中國象棋的將與帥不能在同一直線上直接相對、中間沒有任何棋子。', 'In xiangqi the two generals may never face each other on the same file with nothing between them.'),
    games: ['xiangqi', 'cotuong'], sources: [S.xiangqi],
    demo: {
      base: 'xiangqi', pieces: [['x.k', 0, 'e2'], ['x.k', 1, 'f10']],
      task: L('帥往右走到 f 線就會和將照面，所以不行。往其他方向走一步。', 'Moving the general to the f-file would face the enemy general, so it is forbidden. Move another way.'),
      illegal: ['e2f2'], accept: ['e2d2', 'e2e1', 'e2e3'],
      done: L('雙方的王不能「照面」。', 'The generals may never see each other.'),
    },
  },
  {
    id: 'win.bikjang', category: 'win', status: 'playable',
    name: L('照面（빅장）', 'Bikjang'),
    summary: L('韓國象棋的雙方將帥可以照面。照面時下一方必須破解，或選擇停著；停著就終局，正式比賽以計分決定勝負。', 'In janggi the generals may face each other (bikjang). The next player must break it or pass; a pass ends the game, decided on points in official play.'),
    games: ['janggi'], sources: [S.janggi, S.fsf],
  },
  {
    id: 'win.bareKing', category: 'win', status: 'playable',
    name: L('光王', 'Bare king'),
    summary: L('只剩一個王。波斯象棋：被吃到只剩王就輸，但若下一步能把對方也吃到只剩王則和；蒙古象棋：只剩王為和棋（Robado）。', 'Only a king left. In shatranj a bared king loses unless it can bare the other king next move (draw); in shatar a bare king is a draw (Robado).'),
    games: ['shatranj', 'shatar'], sources: [S.shatranj, S.shatar, S.fsf],
  },
  {
    id: 'win.mateRestrictions', category: 'win', status: 'playable',
    name: L('將死的限制（蒙古）', 'Mating restrictions (Mongolia)'),
    summary: L('蒙古象棋不能只用馬將死；將死前的連續將軍中，至少要有一次由車、馬或 Bers 將軍，否則和棋（Niol）。', 'In shatar a mate by knights alone is not allowed, and a mating series of checks must include a check by a rook, knight or bers; otherwise it is a draw (Niol).'),
    games: ['shatar'], sources: [S.shatar, S.fsf],
  },
  {
    id: 'win.reachGoal', category: 'win', status: 'info',
    name: L('走到目標就贏', 'Win by reaching a goal'),
    summary: L('有些棋把王走到特定位置也算贏：King of the Hill 走到中央四格；Racing Kings 先走到第八排（不能將軍）；Orda 等棋的「Campmate」是王走到對方底線；動物將棋的獅子走到對方底線。', 'Some games are won by reaching a place: the centre four squares in King of the Hill, the eighth rank in Racing Kings (no checks allowed), the last rank in Orda-style campmate, the far rank for the lion in Dobutsu shogi.'),
    others: ['King of the Hill', 'Racing Kings', 'Orda', 'Dobutsu'],
    sources: [S.py('kingofthehill', 'King of the Hill'), S.py('racingkings', 'Racing Kings'), S.py('orda', 'Orda'), S.py('dobutsu', 'Dobutsu')],
  },
  {
    id: 'win.checks', category: 'win', status: 'info',
    name: L('將軍三次就贏', 'Win by three checks'),
    summary: L('Three-check：將軍對方三次即獲勝，將死也一樣算贏。', 'In Three-check, putting the enemy king in check for the third time wins; checkmate also wins.'),
    others: ['Three-check'], sources: [S.py('3check', 'Three-check')],
  },
  {
    id: 'win.losing', category: 'win', status: 'info',
    name: L('輸光才贏（強制吃子）', 'Lose to win (forced captures)'),
    summary: L('Antichess 能吃就必須吃；王不是王（不會被將軍、不能入堡）；先輸光所有棋子或被困斃的一方獲勝。', 'In Antichess captures are compulsory, the king has no royal status, and you win by losing all your pieces or being stalemated.'),
    others: ['Antichess'], sources: [S.py('antichess', 'Antichess')],
  },
  {
    id: 'win.asymmetricGoals', category: 'win', status: 'info',
    name: L('雙方勝利條件不同', 'Different goals for each side'),
    summary: L('Horde：白方 36 個兵，要將死黑方；黑方要吃光所有兵。', 'In Horde, White’s 36 pawns win by checkmating Black, while Black wins by capturing every pawn.'),
    others: ['Horde'], sources: [S.py('horde', 'Horde')],
  },

  // ---------------- 和局與裁決 ----------------
  {
    id: 'draw.fide', category: 'draw', status: 'playable',
    name: L('西洋棋的和棋規則', 'Chess draw rules'),
    summary: L('FIDE 棋規：同一局面出現三次、或 50 回合無吃子無兵移動，輪走方可以要求和棋（9.2、9.3）；出現五次或 75 回合自動和棋（9.6）；雙方都不可能將死時直接和棋（5.2.2）。', 'FIDE Laws: threefold repetition or 50 moves without capture or pawn move can be claimed by the player to move (9.2, 9.3); fivefold repetition or 75 moves draw automatically (9.6); a dead position is a draw (5.2.2).'),
    games: ['chess'], sources: [S.fide],
  },
  {
    id: 'draw.perpetualCheck', category: 'draw', status: 'playable',
    name: L('長將判負', 'Perpetual check loses'),
    summary: L('一方不停將軍造成重複局面時，將軍的一方判負。中國象棋（AXF）、韓國象棋、將棋（連續王手的千日手）都這樣規定。', 'Repeating the position by continuous checks loses for the checking side in xiangqi (AXF), janggi and shogi (perpetual-check sennichite).'),
    games: ['xiangqi', 'cotuong', 'janggi', 'shogi'], sources: [S.fsf, S.janggi, S.jsa],
  },
  {
    id: 'draw.chase', category: 'draw', status: 'playable',
    name: L('長捉判負', 'Perpetual chase loses'),
    summary: L('中國象棋（亞洲象棋聯合會規則）：不停追捉對方同一枚沒有真正保護的棋子，或用較弱的棋子追較強的棋子（馬、炮追車；士、象追車、炮、馬），造成重複局面時追捉方判負。將帥與兵卒追捉不算，追捉未過河的兵也不算。越南象棋聯合會也有類似但不完全相同的條文。',
      'Xiangqi (AXF): repeatedly chasing the same piece that is not truly protected, or a stronger piece with a weaker one (a chariot with a horse or cannon; a chariot, cannon or horse with an advisor or elephant), loses for the chaser. Chases by generals or soldiers do not count, nor do chases of uncrossed soldiers. The Vietnam federation has similar but not identical articles.'),
    games: ['xiangqi', 'cotuong'], sources: [S.fsf, S.vn],
  },
  {
    id: 'draw.sennichite', category: 'draw', status: 'playable',
    name: L('千日手', 'Sennichite'),
    summary: L('將棋同一局面（盤面、持駒、輪走方都相同）出現 4 次為無勝負，交換先後重下。', 'In shogi the same position (board, hands and side to move) occurring four times is no result; the game is replayed with colours reversed.'),
    games: ['shogi'], sources: [S.jsa],
  },
  {
    id: 'draw.jishogi', category: 'draw', status: 'playable',
    name: L('持將棋與入玉宣言', 'Jishōgi and impasse'),
    summary: L('雙方的玉都很難被將死時可以合意計分（大駒 5 點、小駒 1 點，不足 24 點負）；或在符合條件時「入玉宣言」，31 點以上勝；達到 500 手則為持將棋。', 'When neither king can be mated, players may agree to count points (rook/bishop 5, others 1; under 24 loses), or declare impasse when the conditions are met (31 points wins); 500 moves also ends in jishōgi.'),
    games: ['shogi'], sources: [S.jsa],
  },
  {
    id: 'draw.counting', category: 'draw', status: 'playable',
    name: L('數步', 'Counting rules'),
    summary: L('泰國、柬埔寨、緬甸象棋：劣勢方可以開始數步（棋盤數），只剩王時自動開始（棋子數），優勢方必須在上限內將死，否則和棋。上限依優勢方的子力而定，例如一車 16 步。', 'In makruk, ouk and sittuyin the weaker side can start counting (board’s honour), and counting starts automatically against a lone king (pieces’ honour); the stronger side must mate within a limit set by its material, e.g. 16 moves with one rook.'),
    games: ['makruk', 'ouk', 'sittuyin'], sources: [S.makruk, S.ouk, S.sittuyin],
  },
  {
    id: 'draw.points', category: 'draw', status: 'playable',
    name: L('計分判定', 'Deciding on points'),
    summary: L('韓國象棋正式比賽中，照面後停著、重複局面、50 回合無吃子、雙方連續停著時以計分決定：車 13、包 7、馬 5、象 3、士 3、兵 2，漢加 1.5 分。', 'In official janggi, a pass during bikjang, repetition, 50 moves without capture and double passes are decided on points: chariot 13, cannon 7, horse 5, elephant 3, guard 3, soldier 2, plus 1.5 for Han.'),
    games: ['janggi'], sources: [S.janggi],
  },

  // ---------------- 開局 ----------------
  {
    id: 'open.setupChoice', category: 'opening', status: 'playable',
    name: L('選擇擺法', 'Choosing a setup'),
    summary: L('韓國象棋開局時，漢方先、楚方後，各自選擇左右兩邊馬與象的位置，共四種擺法。', 'At the start of janggi, Han and then Cho each choose where their horses and elephants stand, giving four possible setups.'),
    games: ['janggi'], sources: [S.janggi],
  },
  {
    id: 'open.random', category: 'opening', status: 'info',
    name: L('隨機底線（960）', 'Random back rank (960)'),
    summary: L('Chess960 隨機排列底線棋子，但兩個象必須在不同顏色的格子、王必須在兩個城堡之間；入堡後王與城堡的位置和一般西洋棋相同。', 'Chess960 shuffles the back rank, with bishops on opposite colours and the king between the rooks; after castling, king and rook end on the usual squares.'),
    others: ['Chess960'], sources: [S.py('chess960', 'Chess960')],
  },
  {
    id: 'open.asymmetric', category: 'opening', status: 'info',
    name: L('雙方軍隊不同', 'Asymmetric armies'),
    summary: L('雙方使用不同的棋子。例如滿洲棋（Manchu+）黑方只有一枚兼具車、炮、馬走法的「旗」取代車炮馬；Orda、Spartan 等也是兩支不同的軍隊。', 'The two sides use different pieces: in Manchu+ Black’s chariots, cannons and horses are replaced by a single Banner that moves as all three; Orda and Spartan also pit two different armies.'),
    others: ['Manchu+', 'Orda', 'Spartan Chess', 'Horde'], sources: [S.py('manchu', 'Manchu+'), S.py('orda', 'Orda'), S.py('spartan', 'Spartan')],
  },
];
