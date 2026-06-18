import { useMemo, useRef, useState } from "react";
import { CommandPanel } from "./components/CommandPanel";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { EventLog, LogEntry } from "./components/EventLog";
import { StatusPanel } from "./components/StatusPanel";
import { XiangqiBoard } from "./components/XiangqiBoard";
import {
  applyMoveToFen,
  buildMoveUci,
  INITIAL_FEN,
  isValidMoveUci,
  parseFenBoard,
  sideFromFen,
} from "./game/xiangqi";
import { ConnectionPhase, RuleshiftEvent, RuleshiftSocket } from "./network/RuleshiftSocket";
import {
  commandLabel,
  GameCommandType,
  GameStatus,
  StateDeltaWire,
  StateSnapshotWire,
  XiangqiSide,
} from "./protocol/ruleshiftProtocol";

const DEFAULT_SERVER_URL = "ws://147.45.211.122:8080/ws";
const DEFAULT_TICKET = "mock:player-1";
const DEFAULT_ROOM_ID = "demo";
const MAX_LOG_ENTRIES = 160;

interface RoomViewState {
  roomId: string;
  playerId: string;
  displayName: string;
  redPlayerId: string;
  blackPlayerId: string;
  revision: string;
  stateHash: string;
  sideToMove: XiangqiSide;
  status: GameStatus;
  fen: string;
  winnerPlayerId: string;
  drawOfferedByPlayerId: string;
  latestMove: string;
}

const initialRoomState: RoomViewState = {
  roomId: DEFAULT_ROOM_ID,
  playerId: "",
  displayName: "",
  redPlayerId: "",
  blackPlayerId: "",
  revision: "0",
  stateHash: "0",
  sideToMove: sideFromFen(INITIAL_FEN),
  status: GameStatus.Unspecified,
  fen: INITIAL_FEN,
  winnerPlayerId: "",
  drawOfferedByPlayerId: "",
  latestMove: "",
};

export default function App(): JSX.Element {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [ticket, setTicket] = useState(DEFAULT_TICKET);
  const [roomInput, setRoomInput] = useState(DEFAULT_ROOM_ID);
  const [phase, setPhase] = useState<ConnectionPhase>("idle");
  const [room, setRoom] = useState<RoomViewState>(initialRoomState);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [moveInput, setMoveInput] = useState("h2e2");
  const [strictRevision, setStrictRevision] = useState(false);
  const [selected, setSelected] = useState<{ row: number; col: number } | null>(null);

  const roomRef = useRef(room);
  roomRef.current = room;

  const clientRef = useRef<RuleshiftSocket | null>(null);
  if (!clientRef.current) {
    clientRef.current = new RuleshiftSocket((event) => handleRuleshiftEvent(event));
  }

  const board = useMemo(() => parseFenBoard(room.fen), [room.fen]);
  const connected = phase === "connected";

  function appendLog(level: LogEntry["level"], message: string): void {
    setLogs((current) =>
      [
        {
          id: Date.now() + Math.random(),
          level,
          message,
          at: new Date().toLocaleTimeString(),
        },
        ...current,
      ].slice(0, MAX_LOG_ENTRIES),
    );
  }

  function handleRuleshiftEvent(event: RuleshiftEvent): void {
    switch (event.type) {
      case "phase":
        setPhase(event.phase);
        if (event.detail) {
          appendLog("info", `${event.phase}: ${event.detail}`);
        }
        break;
      case "auth":
        setRoom((current) => ({
          ...current,
          playerId: event.playerId,
          displayName: event.displayName,
        }));
        appendLog("info", `auth ok player=${event.playerId}`);
        break;
      case "join":
        setRoom((current) => ({
          ...current,
          roomId: event.roomId,
          revision: event.revision,
        }));
        appendLog("info", `join ok room=${event.roomId} revision=${event.revision}`);
        break;
      case "snapshot":
        applySnapshot(event.snapshot);
        break;
      case "delta":
        applyDelta(event.delta);
        break;
      case "server-error":
        appendLog("error", `server error ${event.code}: ${event.message}`);
        break;
      case "log":
        appendLog(event.level, event.message);
        break;
    }
  }

  function applySnapshot(snapshot: StateSnapshotWire): void {
    const xiangqi = snapshot.xiangqi;
    if (!xiangqi) {
      appendLog("warn", `snapshot r${snapshot.revision} has no xiangqi payload`);
      return;
    }
    setRoom((current) => ({
      ...current,
      roomId: snapshot.roomId,
      revision: snapshot.revision,
      fen: xiangqi.fen || current.fen,
      sideToMove: xiangqi.sideToMove,
      status: xiangqi.status,
      redPlayerId: xiangqi.redPlayerId,
      blackPlayerId: xiangqi.blackPlayerId,
      winnerPlayerId: xiangqi.winnerPlayerId,
      drawOfferedByPlayerId: xiangqi.drawOfferedByPlayerId,
      stateHash: xiangqi.stateHash,
      latestMove: "",
    }));
    setSelected(null);
    appendLog("info", `snapshot room=${snapshot.roomId} revision=${snapshot.revision}`);
  }

  function applyDelta(delta: StateDeltaWire): void {
    const current = roomRef.current;
    if (delta.previousRevision !== current.revision && current.revision !== "0") {
      appendLog(
        "warn",
        `revision gap local=${current.revision} delta=${delta.previousRevision}->${delta.newRevision}; requesting snapshot`,
      );
      clientRef.current?.requestSnapshot();
      return;
    }

    const xiangqi = delta.xiangqi;
    if (!xiangqi) {
      appendLog("warn", `delta r${delta.newRevision} has no xiangqi payload`);
      clientRef.current?.requestSnapshot();
      return;
    }

    let fen = current.fen;
    if (xiangqi.commandType === GameCommandType.DoMove) {
      if (!isValidMoveUci(xiangqi.moveUci)) {
        appendLog("warn", "move delta without valid UCI; requesting snapshot");
        clientRef.current?.requestSnapshot();
        return;
      }
      fen = applyMoveToFen(current.fen, xiangqi.moveUci, xiangqi.sideToMove);
    }

    setRoom((active) => ({
      ...active,
      roomId: delta.roomId,
      revision: delta.newRevision,
      fen,
      sideToMove: xiangqi.sideToMove,
      status: xiangqi.status,
      winnerPlayerId: xiangqi.winnerPlayerId,
      drawOfferedByPlayerId: xiangqi.drawOfferedByPlayerId,
      stateHash: xiangqi.stateHash,
      latestMove: xiangqi.moveUci,
    }));
    setSelected(null);
    appendLog("info", `${commandLabel(xiangqi.commandType)} by ${delta.changedByPlayerId || "-"} r${delta.newRevision}`);
  }

  function connect(): void {
    const trimmedUrl = serverUrl.trim();
    const trimmedTicket = ticket.trim();
    const trimmedRoom = roomInput.trim();
    if (!trimmedUrl || !trimmedTicket || !trimmedRoom) {
      appendLog("error", "server URL, ticket, and room are required");
      return;
    }
    setRoom((current) => ({
      ...current,
      roomId: trimmedRoom,
      revision: "0",
      latestMove: "",
    }));
    clientRef.current?.connect({
      url: trimmedUrl,
      ticket: trimmedTicket,
      roomId: trimmedRoom,
      lastSeenRevision: "0",
    });
  }

  function submitMove(rawMove = moveInput): void {
    const move = rawMove.trim().toLowerCase();
    if (!isValidMoveUci(move)) {
      appendLog("error", `invalid UCI move: ${rawMove}`);
      return;
    }
    clientRef.current?.sendMove(move, strictRevision);
    setMoveInput(move);
  }

  function handleBoardSelect(square: { row: number; col: number }, moveUci?: string): void {
    if (!selected) {
      setSelected(square);
      setMoveInput(buildMoveUci(square, square));
      return;
    }
    if (selected.row === square.row && selected.col === square.col) {
      setSelected(null);
      return;
    }
    const nextMove = moveUci ?? buildMoveUci(selected, square);
    setMoveInput(nextMove);
    setSelected(null);
    submitMove(nextMove);
  }

  return (
    <main className="app-shell">
      <section className="play-area">
        <div className="board-header">
          <div>
            <p className="eyebrow">Ruleshift</p>
            <h1>Xiangqi Room {room.roomId || roomInput}</h1>
          </div>
          <div className="turn-strip">
            <span>{room.sideToMove === XiangqiSide.Black ? "Black" : "Red"} to move</span>
            <strong>r{room.revision}</strong>
          </div>
        </div>
        <XiangqiBoard
          board={board}
          selected={selected}
          latestMove={room.latestMove}
          sideToMove={room.sideToMove}
          onSelect={handleBoardSelect}
        />
      </section>
      <aside className="side-rail">
        <ConnectionPanel
          serverUrl={serverUrl}
          ticket={ticket}
          roomId={roomInput}
          phase={phase}
          onServerUrlChange={setServerUrl}
          onTicketChange={setTicket}
          onRoomIdChange={setRoomInput}
          onConnect={connect}
          onDisconnect={() => clientRef.current?.disconnect()}
          onReconnect={() => clientRef.current?.reconnect()}
        />
        <CommandPanel
          moveInput={moveInput}
          strictRevision={strictRevision}
          disabled={!connected}
          onMoveInputChange={setMoveInput}
          onSubmitMove={() => submitMove()}
          onSnapshot={() => clientRef.current?.requestSnapshot()}
          onResign={() => clientRef.current?.resign(strictRevision)}
          onOfferDraw={() => clientRef.current?.offerDraw(strictRevision)}
          onPing={() => clientRef.current?.ping()}
          onStrictRevisionChange={setStrictRevision}
        />
        <StatusPanel
          roomId={room.roomId}
          playerId={room.playerId}
          displayName={room.displayName}
          redPlayerId={room.redPlayerId}
          blackPlayerId={room.blackPlayerId}
          revision={room.revision}
          stateHash={room.stateHash}
          sideToMove={room.sideToMove}
          status={room.status}
          fen={room.fen}
          winnerPlayerId={room.winnerPlayerId}
          drawOfferedByPlayerId={room.drawOfferedByPlayerId}
        />
        <EventLog entries={logs} />
      </aside>
    </main>
  );
}
