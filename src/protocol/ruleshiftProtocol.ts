import Long from "long";
import protobuf from "protobufjs";
import protoSource from "./ruleshift.proto?raw";

protobuf.util.Long = Long;
protobuf.configure();

export const PROTOCOL_VERSION = 1;

export const enum XiangqiSide {
  Unspecified = 0,
  Red = 1,
  Black = 2,
}

export const enum GameStatus {
  Unspecified = 0,
  Active = 1,
  Resigned = 2,
  DrawOffered = 3,
  Drawn = 4,
}

export const enum GameCommandType {
  Unspecified = 0,
  DoMove = 1,
  Resign = 2,
  OfferDraw = 3,
}

export type ClientPayload =
  | { authRequest: { ticket: string } }
  | { joinRoom: { roomId: string; lastSeenRevision: number | string } }
  | { gameCommand: GameCommandWire }
  | { snapshotRequest: { roomId: string; lastSeenRevision: number | string } }
  | { ping: { clientTimeUnixMs: number | string } };

export interface GameCommandWire {
  roomId: string;
  expectedRevision: number | string;
  doMove?: {
    fromSquare?: number;
    toSquare?: number;
    moveUci: string;
  };
  resign?: Record<string, never>;
  offerDraw?: Record<string, never>;
}

export interface AuthOkWire {
  playerId: string;
  displayName: string;
}

export interface AuthFailedWire {
  reason: string;
}

export interface JoinRoomOkWire {
  roomId: string;
  currentRevision: string;
}

export interface ErrorMessageWire {
  code: string;
  message: string;
}

export interface PongWire {
  clientTimeUnixMs: string;
  serverTimeUnixMs: string;
}

export interface StateSnapshotWire {
  roomId: string;
  revision: string;
  gameType: number;
  xiangqi?: XiangqiSnapshotWire;
}

export interface XiangqiSnapshotWire {
  fen: string;
  board: number[];
  sideToMove: XiangqiSide;
  status: GameStatus;
  redPlayerId: string;
  blackPlayerId: string;
  winnerPlayerId: string;
  drawOfferedByPlayerId: string;
  stateHash: string;
}

export interface StateDeltaWire {
  roomId: string;
  previousRevision: string;
  newRevision: string;
  changedByPlayerId: string;
  gameType: number;
  xiangqi?: XiangqiDeltaWire;
}

export interface SquareUpdateWire {
  square: number;
  piece: number;
}

export interface XiangqiDeltaWire {
  commandType: GameCommandType;
  moveUci: string;
  fromSquare: number;
  toSquare: number;
  squareUpdates: SquareUpdateWire[];
  sideToMove: XiangqiSide;
  status: GameStatus;
  winnerPlayerId: string;
  drawOfferedByPlayerId: string;
  stateHash: string;
}

export type ServerPayload =
  | { kind: "authOk"; value: AuthOkWire }
  | { kind: "authFailed"; value: AuthFailedWire }
  | { kind: "joinRoomOk"; value: JoinRoomOkWire }
  | { kind: "stateSnapshot"; value: StateSnapshotWire }
  | { kind: "stateDelta"; value: StateDeltaWire }
  | { kind: "error"; value: ErrorMessageWire }
  | { kind: "pong"; value: PongWire }
  | { kind: "unknown"; value: Record<string, unknown> };

export interface DecodedServerEnvelope {
  protocolVersion: number;
  serverSequence: string;
  payload: ServerPayload;
}

const root = protobuf.parse(protoSource).root;
const ClientEnvelope = root.lookupType("ruleshift.v1.ClientEnvelope");
const ServerEnvelope = root.lookupType("ruleshift.v1.ServerEnvelope");

const longStringOptions: protobuf.IConversionOptions = {
  enums: Number,
  longs: String,
  arrays: true,
  defaults: false,
  oneofs: true,
};

export function encodeClientEnvelope(clientSequence: number, payload: ClientPayload): Uint8Array {
  const envelope = {
    protocolVersion: PROTOCOL_VERSION,
    clientSequence: uint64Value(clientSequence),
    ...normalizeClientPayload(payload),
  };
  const error = ClientEnvelope.verify(envelope);
  if (error) {
    throw new Error(`invalid ClientEnvelope: ${error}`);
  }
  return ClientEnvelope.encode(ClientEnvelope.create(envelope)).finish();
}

function normalizeClientPayload(payload: ClientPayload): Record<string, unknown> {
  if ("authRequest" in payload) {
    return payload;
  }
  if ("joinRoom" in payload) {
    return {
      joinRoom: {
        roomId: payload.joinRoom.roomId,
        lastSeenRevision: uint64Value(payload.joinRoom.lastSeenRevision),
      },
    };
  }
  if ("snapshotRequest" in payload) {
    return {
      snapshotRequest: {
        roomId: payload.snapshotRequest.roomId,
        lastSeenRevision: uint64Value(payload.snapshotRequest.lastSeenRevision),
      },
    };
  }
  if ("ping" in payload) {
    return {
      ping: {
        clientTimeUnixMs: int64Value(payload.ping.clientTimeUnixMs),
      },
    };
  }

  const command = payload.gameCommand;
  return {
    gameCommand: {
      roomId: command.roomId,
      expectedRevision: uint64Value(command.expectedRevision),
      ...(command.doMove
        ? {
            doMove: {
              fromSquare: command.doMove.fromSquare,
              toSquare: command.doMove.toSquare,
              moveUci: command.doMove.moveUci,
            },
          }
        : {}),
      ...(command.resign ? { resign: command.resign } : {}),
      ...(command.offerDraw ? { offerDraw: command.offerDraw } : {}),
    },
  };
}

export function decodeServerEnvelope(bytes: ArrayBuffer): DecodedServerEnvelope {
  const envelope = ServerEnvelope.toObject(ServerEnvelope.decode(new Uint8Array(bytes)), longStringOptions) as Record<
    string,
    unknown
  >;
  const protocolVersion = numberField(envelope.protocolVersion);
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(`unsupported server protocol version: got=${protocolVersion} want=${PROTOCOL_VERSION}`);
  }

  return {
    protocolVersion,
    serverSequence: stringField(envelope.serverSequence),
    payload: normalizeServerPayload(envelope),
  };
}

export function sideLabel(side?: XiangqiSide): string {
  switch (side) {
    case XiangqiSide.Red:
      return "Red";
    case XiangqiSide.Black:
      return "Black";
    default:
      return "Unspecified";
  }
}

export function statusLabel(status?: GameStatus): string {
  switch (status) {
    case GameStatus.Active:
      return "Active";
    case GameStatus.Resigned:
      return "Resigned";
    case GameStatus.DrawOffered:
      return "Draw offered";
    case GameStatus.Drawn:
      return "Drawn";
    default:
      return "Unspecified";
  }
}

export function commandLabel(command?: GameCommandType): string {
  switch (command) {
    case GameCommandType.DoMove:
      return "Move";
    case GameCommandType.Resign:
      return "Resign";
    case GameCommandType.OfferDraw:
      return "Offer draw";
    default:
      return "Unspecified";
  }
}

function normalizeServerPayload(envelope: Record<string, unknown>): ServerPayload {
  if (isRecord(envelope.authOk)) {
    return { kind: "authOk", value: authOk(envelope.authOk) };
  }
  if (isRecord(envelope.authFailed)) {
    return { kind: "authFailed", value: authFailed(envelope.authFailed) };
  }
  if (isRecord(envelope.joinRoomOk)) {
    return { kind: "joinRoomOk", value: joinRoomOk(envelope.joinRoomOk) };
  }
  if (isRecord(envelope.stateSnapshot)) {
    return { kind: "stateSnapshot", value: stateSnapshot(envelope.stateSnapshot) };
  }
  if (isRecord(envelope.stateDelta)) {
    return { kind: "stateDelta", value: stateDelta(envelope.stateDelta) };
  }
  if (isRecord(envelope.error)) {
    return { kind: "error", value: errorMessage(envelope.error) };
  }
  if (isRecord(envelope.pong)) {
    return { kind: "pong", value: pong(envelope.pong) };
  }
  return { kind: "unknown", value: envelope };
}

function authOk(value: Record<string, unknown>): AuthOkWire {
  return {
    playerId: stringField(value.playerId),
    displayName: stringField(value.displayName),
  };
}

function authFailed(value: Record<string, unknown>): AuthFailedWire {
  return { reason: stringField(value.reason) };
}

function joinRoomOk(value: Record<string, unknown>): JoinRoomOkWire {
  return {
    roomId: stringField(value.roomId),
    currentRevision: stringField(value.currentRevision),
  };
}

function errorMessage(value: Record<string, unknown>): ErrorMessageWire {
  return {
    code: stringField(value.code),
    message: stringField(value.message),
  };
}

function pong(value: Record<string, unknown>): PongWire {
  return {
    clientTimeUnixMs: stringField(value.clientTimeUnixMs),
    serverTimeUnixMs: stringField(value.serverTimeUnixMs),
  };
}

function stateSnapshot(value: Record<string, unknown>): StateSnapshotWire {
  return {
    roomId: stringField(value.roomId),
    revision: stringField(value.revision),
    gameType: numberField(value.gameType),
    xiangqi: isRecord(value.xiangqi) ? xiangqiSnapshot(value.xiangqi) : undefined,
  };
}

function xiangqiSnapshot(value: Record<string, unknown>): XiangqiSnapshotWire {
  return {
    fen: stringField(value.fen),
    board: numberArray(value.board),
    sideToMove: numberField(value.sideToMove) as XiangqiSide,
    status: numberField(value.status) as GameStatus,
    redPlayerId: stringField(value.redPlayerId),
    blackPlayerId: stringField(value.blackPlayerId),
    winnerPlayerId: stringField(value.winnerPlayerId),
    drawOfferedByPlayerId: stringField(value.drawOfferedByPlayerId),
    stateHash: stringField(value.stateHash),
  };
}

function stateDelta(value: Record<string, unknown>): StateDeltaWire {
  return {
    roomId: stringField(value.roomId),
    previousRevision: stringField(value.previousRevision),
    newRevision: stringField(value.newRevision),
    changedByPlayerId: stringField(value.changedByPlayerId),
    gameType: numberField(value.gameType),
    xiangqi: isRecord(value.xiangqi) ? xiangqiDelta(value.xiangqi) : undefined,
  };
}

function xiangqiDelta(value: Record<string, unknown>): XiangqiDeltaWire {
  return {
    commandType: numberField(value.commandType) as GameCommandType,
    moveUci: stringField(value.moveUci),
    fromSquare: numberField(value.fromSquare),
    toSquare: numberField(value.toSquare),
    squareUpdates: squareUpdates(value.squareUpdates),
    sideToMove: numberField(value.sideToMove) as XiangqiSide,
    status: numberField(value.status) as GameStatus,
    winnerPlayerId: stringField(value.winnerPlayerId),
    drawOfferedByPlayerId: stringField(value.drawOfferedByPlayerId),
    stateHash: stringField(value.stateHash),
  };
}

function squareUpdates(value: unknown): SquareUpdateWire[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map((entry) => ({
    square: numberField(entry.square),
    piece: numberField(entry.piece),
  }));
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(numberField) : [];
}

function stringField(value: unknown): string {
  if (value == null) {
    return "";
  }
  return String(value);
}

function numberField(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value !== "") {
    return Number(value);
  }
  return 0;
}

function uint64Value(value: number | string): Long {
  return Long.fromString(String(value || 0), true);
}

function int64Value(value: number | string): Long {
  return Long.fromString(String(value || 0), false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
