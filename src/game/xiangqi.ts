import { XiangqiSide } from "../protocol/ruleshiftProtocol";

export const INITIAL_FEN = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1";
export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h", "i"] as const;

export type PieceCode =
  | "K"
  | "A"
  | "B"
  | "N"
  | "R"
  | "C"
  | "P"
  | "k"
  | "a"
  | "b"
  | "n"
  | "r"
  | "c"
  | "p";

export type BoardPiece = PieceCode | null;
export type BoardMatrix = BoardPiece[][];

export interface BoardSquare {
  row: number;
  col: number;
  coordinate: string;
  piece: BoardPiece;
}

const pieceGlyphs: Record<PieceCode, string> = {
  K: "帥",
  A: "仕",
  B: "相",
  N: "傌",
  R: "俥",
  C: "炮",
  P: "兵",
  k: "將",
  a: "士",
  b: "象",
  n: "馬",
  r: "車",
  c: "砲",
  p: "卒",
};

const pieceNames: Record<PieceCode, string> = {
  K: "Red general",
  A: "Red advisor",
  B: "Red elephant",
  N: "Red horse",
  R: "Red chariot",
  C: "Red cannon",
  P: "Red soldier",
  k: "Black general",
  a: "Black advisor",
  b: "Black elephant",
  n: "Black horse",
  r: "Black chariot",
  c: "Black cannon",
  p: "Black soldier",
};

export function parseFenBoard(fen: string): BoardMatrix {
  const placement = fen.trim().split(/\s+/)[0] || INITIAL_FEN.split(" ")[0];
  const rows = placement.split("/");
  const board: BoardMatrix = Array.from({ length: 10 }, () => Array<BoardPiece>(9).fill(null));

  for (let row = 0; row < Math.min(10, rows.length); row += 1) {
    let col = 0;
    for (const char of rows[row]) {
      if (/\d/.test(char)) {
        col += Number(char);
        continue;
      }
      if (isPieceCode(char) && col < 9) {
        board[row][col] = char;
        col += 1;
      }
    }
  }

  return board;
}

export function boardToSquares(board: BoardMatrix): BoardSquare[] {
  const squares: BoardSquare[] = [];
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      squares.push({
        row,
        col,
        coordinate: squareToCoordinate(row, col),
        piece: board[row]?.[col] ?? null,
      });
    }
  }
  return squares;
}

export function pieceGlyph(piece: BoardPiece): string {
  return piece ? pieceGlyphs[piece] : "";
}

export function pieceName(piece: BoardPiece): string {
  return piece ? pieceNames[piece] : "Empty square";
}

export function pieceSide(piece: BoardPiece): XiangqiSide | undefined {
  if (!piece) {
    return undefined;
  }
  return piece === piece.toUpperCase() ? XiangqiSide.Red : XiangqiSide.Black;
}

export function squareToCoordinate(row: number, col: number): string {
  return `${FILES[col] ?? "?"}${9 - row}`;
}

export function coordinateToSquare(coordinate: string): { row: number; col: number } | null {
  if (!/^[a-i][0-9]$/i.test(coordinate)) {
    return null;
  }
  const file = coordinate[0].toLowerCase();
  const rank = Number(coordinate[1]);
  const col = FILES.indexOf(file as (typeof FILES)[number]);
  const row = 9 - rank;
  if (col < 0 || row < 0 || row > 9) {
    return null;
  }
  return { row, col };
}

export function buildMoveUci(from: { row: number; col: number }, to: { row: number; col: number }): string {
  return `${squareToCoordinate(from.row, from.col)}${squareToCoordinate(to.row, to.col)}`.toLowerCase();
}

export function isValidMoveUci(move: string): boolean {
  return /^[a-i][0-9][a-i][0-9]$/i.test(move.trim());
}

export function applyMoveToFen(fen: string, moveUci: string, sideToMove?: XiangqiSide): string {
  if (!isValidMoveUci(moveUci)) {
    return fen;
  }
  const parts = fen.trim().split(/\s+/);
  const board = parseFenBoard(fen);
  const from = coordinateToSquare(moveUci.slice(0, 2));
  const to = coordinateToSquare(moveUci.slice(2, 4));
  if (!from || !to) {
    return fen;
  }

  const moving = board[from.row]?.[from.col] ?? null;
  if (!moving) {
    return fen;
  }

  board[from.row][from.col] = null;
  board[to.row][to.col] = moving;

  parts[0] = boardToFenPlacement(board);
  parts[1] = sideToMove === XiangqiSide.Black ? "b" : "w";
  while (parts.length < 6) {
    parts.push(parts.length === 2 || parts.length === 3 ? "-" : parts.length === 4 ? "0" : "1");
  }
  return parts.join(" ");
}

export function sideFromFen(fen: string): XiangqiSide {
  const active = fen.trim().split(/\s+/)[1];
  return active === "b" ? XiangqiSide.Black : XiangqiSide.Red;
}

function boardToFenPlacement(board: BoardMatrix): string {
  return board
    .map((row) => {
      let empty = 0;
      let output = "";
      for (const piece of row) {
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty > 0) {
          output += String(empty);
          empty = 0;
        }
        output += piece;
      }
      return output + (empty > 0 ? String(empty) : "");
    })
    .join("/");
}

function isPieceCode(value: string): value is PieceCode {
  return Object.prototype.hasOwnProperty.call(pieceGlyphs, value);
}
