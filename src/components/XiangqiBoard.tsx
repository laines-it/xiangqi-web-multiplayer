import { useEffect, useRef, useState } from "react";
import { BoardMatrix, BoardPiece, buildMoveUci, pieceGlyph, pieceName, pieceSide } from "../game/xiangqi";
import { XiangqiSide } from "../protocol/ruleshiftProtocol";

const BOARD_COLS = 9;
const BOARD_ROWS = 10;
const CELL_SIZE = 57;
const PADDING = 30;
const PIECE_RADIUS = 23;
const CANVAS_WIDTH = PADDING * 2 + (BOARD_COLS - 1) * CELL_SIZE;
const CANVAS_HEIGHT = PADDING * 2 + (BOARD_ROWS - 1) * CELL_SIZE;

interface XiangqiBoardProps {
  board: BoardMatrix;
  selected: { row: number; col: number } | null;
  latestMove: string;
  sideToMove: XiangqiSide;
  onSelect: (square: { row: number; col: number }, moveUci?: string) => void;
}

export function XiangqiBoard({ board, selected, latestMove, sideToMove, onSelect }: XiangqiBoardProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hovered, setHovered] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    drawBoard(ctx, {
      board,
      selected,
      hovered,
      latestMove,
      sideToMove,
    });
  }, [board, hovered, latestMove, selected, sideToMove]);

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    const square = eventToSquare(event);
    setHovered(square);
  }

  function handlePointerLeave(): void {
    setHovered(null);
  }

  function handleClick(event: React.MouseEvent<HTMLCanvasElement>): void {
    const square = eventToSquare(event);
    if (!square) {
      return;
    }
    onSelect(square, selected ? buildMoveUci(selected, square) : undefined);
  }

  function eventToSquare(event: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return pointToSquare(x, y);
  }

  return (
    <div className="board-shell" aria-label="Xiangqi board">
      <canvas
        ref={canvasRef}
        className="board-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        aria-label="Xiangqi board"
        role="img"
        onClick={handleClick}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
      />
    </div>
  );
}

interface DrawState {
  board: BoardMatrix;
  selected: { row: number; col: number } | null;
  hovered: { row: number; col: number } | null;
  latestMove: string;
  sideToMove: XiangqiSide;
}

function drawBoard(ctx: CanvasRenderingContext2D, state: DrawState): void {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawBoardSurface(ctx);
  drawGrid(ctx);
  drawPalaceDiagonals(ctx);
  drawRiver(ctx);
  drawHighlights(ctx, state);

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const piece = state.board[row]?.[col] ?? null;
      if (piece) {
        drawPiece(ctx, row, col, piece, pieceSide(piece) === state.sideToMove);
      }
    }
  }
}

function drawBoardSurface(ctx: CanvasRenderingContext2D): void {
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#efd28b");
  gradient.addColorStop(0.55, "#e3ba67");
  gradient.addColorStop(1, "#dcae58");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "rgba(72, 45, 20, 0.26)";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, CANVAS_WIDTH - 16, CANVAS_HEIGHT - 16);
}

function drawGrid(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "#4a301b";
  ctx.lineWidth = 1.2;

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    const y = pointY(row);
    ctx.beginPath();
    ctx.moveTo(pointX(0), y);
    ctx.lineTo(pointX(8), y);
    ctx.stroke();
  }

  for (let col = 0; col < BOARD_COLS; col += 1) {
    const x = pointX(col);
    if (col === 0 || col === BOARD_COLS - 1) {
      ctx.beginPath();
      ctx.moveTo(x, pointY(0));
      ctx.lineTo(x, pointY(9));
      ctx.stroke();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(x, pointY(0));
    ctx.lineTo(x, pointY(4));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, pointY(5));
    ctx.lineTo(x, pointY(9));
    ctx.stroke();
  }
}

function drawPalaceDiagonals(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "#4a301b";
  ctx.lineWidth = 1.2;

  drawLine(ctx, 3, 0, 5, 2);
  drawLine(ctx, 5, 0, 3, 2);
  drawLine(ctx, 3, 7, 5, 9);
  drawLine(ctx, 5, 7, 3, 9);
}

function drawRiver(ctx: CanvasRenderingContext2D): void {
  const y = PADDING + 4.5 * CELL_SIZE;
  ctx.save();
  ctx.font = "600 23px Georgia, 'Times New Roman', serif";
  ctx.fillStyle = "rgba(74, 48, 27, 0.70)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("楚 河", pointX(2), y);
  ctx.fillText("汉 界", pointX(6), y);
  ctx.restore();
}

function drawHighlights(ctx: CanvasRenderingContext2D, state: DrawState): void {
  const latest = latestMoveToSquares(state.latestMove);
  if (latest) {
    drawIntersectionHighlight(ctx, latest.from.row, latest.from.col, "rgba(214, 62, 62, 0.20)");
    drawIntersectionHighlight(ctx, latest.to.row, latest.to.col, "rgba(214, 62, 62, 0.28)");
  }
  if (state.selected) {
    drawIntersectionHighlight(ctx, state.selected.row, state.selected.col, "rgba(24, 118, 108, 0.28)");
  }
  if (state.hovered && state.board[state.hovered.row]?.[state.hovered.col]) {
    drawIntersectionHighlight(ctx, state.hovered.row, state.hovered.col, "rgba(10, 32, 44, 0.08)");
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  row: number,
  col: number,
  piece: BoardPiece,
  isSideToMove: boolean,
): void {
  const x = pointX(col);
  const y = pointY(row);
  const side = pieceSide(piece);
  const stroke = side === XiangqiSide.Red ? "#c62f2f" : "#17232f";

  ctx.save();
  ctx.shadowColor = "rgba(21, 26, 36, 0.24)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.arc(x, y, PIECE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "#fff4dd";
  ctx.fill();
  ctx.restore();

  if (isSideToMove) {
    ctx.beginPath();
    ctx.arc(x, y, PIECE_RADIUS + 4, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(24, 118, 108, 0.24)";
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(x, y, PIECE_RADIUS, 0, Math.PI * 2);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, PIECE_RADIUS - 5, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  ctx.font = "700 22px KaiTi, STKaiti, SimSun, serif";
  ctx.fillStyle = stroke;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pieceGlyph(piece), x, y + 1);
}

function pointToSquare(x: number, y: number): { row: number; col: number } | null {
  let best: { row: number; col: number; distance: number } | null = null;

  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      const distance = Math.hypot(x - pointX(col), y - pointY(row));
      if (distance < PIECE_RADIUS + 8 && (!best || distance < best.distance)) {
        best = { row, col, distance };
      }
    }
  }

  return best ? { row: best.row, col: best.col } : null;
}

function latestMoveToSquares(move: string): { from: { row: number; col: number }; to: { row: number; col: number } } | null {
  if (!/^[a-i][0-9][a-i][0-9]$/i.test(move)) {
    return null;
  }
  const from = coordinateToCanvasSquare(move.slice(0, 2));
  const to = coordinateToCanvasSquare(move.slice(2, 4));
  return from && to ? { from, to } : null;
}

function coordinateToCanvasSquare(coordinate: string): { row: number; col: number } | null {
  const file = coordinate[0]?.toLowerCase();
  const rank = Number(coordinate[1]);
  const col = "abcdefghi".indexOf(file);
  const row = 9 - rank;
  return col >= 0 && row >= 0 && row < BOARD_ROWS ? { row, col } : null;
}

function drawIntersectionHighlight(ctx: CanvasRenderingContext2D, row: number, col: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(pointX(col) - CELL_SIZE / 2, pointY(row) - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
}

function drawLine(ctx: CanvasRenderingContext2D, fromCol: number, fromRow: number, toCol: number, toRow: number): void {
  ctx.beginPath();
  ctx.moveTo(pointX(fromCol), pointY(fromRow));
  ctx.lineTo(pointX(toCol), pointY(toRow));
  ctx.stroke();
}

function pointX(col: number): number {
  return PADDING + col * CELL_SIZE;
}

function pointY(row: number): number {
  return PADDING + row * CELL_SIZE;
}
