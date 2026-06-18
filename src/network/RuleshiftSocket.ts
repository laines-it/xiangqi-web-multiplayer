import {
  commandLabel,
  decodeServerEnvelope,
  encodeClientEnvelope,
  GameCommandType,
  ServerPayload,
  StateDeltaWire,
  StateSnapshotWire,
} from "../protocol/ruleshiftProtocol";

export type ConnectionPhase =
  | "idle"
  | "connecting"
  | "authenticating"
  | "joining"
  | "connected"
  | "disconnected"
  | "error";

export interface ConnectOptions {
  url: string;
  ticket: string;
  roomId: string;
  lastSeenRevision: string;
}

export type RuleshiftEvent =
  | { type: "phase"; phase: ConnectionPhase; detail?: string }
  | { type: "auth"; playerId: string; displayName: string }
  | { type: "join"; roomId: string; revision: string }
  | { type: "snapshot"; snapshot: StateSnapshotWire }
  | { type: "delta"; delta: StateDeltaWire }
  | { type: "server-error"; code: string; message: string }
  | { type: "log"; level: "info" | "warn" | "error"; message: string };

export class RuleshiftSocket {
  private ws: WebSocket | null = null;
  private clientSequence = 0;
  private options: ConnectOptions | null = null;
  private activeRoomId = "";
  private activeRevision = "0";

  constructor(private readonly emit: (event: RuleshiftEvent) => void) {}

  connect(options: ConnectOptions): void {
    this.disconnect("reconnect");
    this.options = options;
    this.activeRoomId = options.roomId;
    this.activeRevision = options.lastSeenRevision || "0";
    this.clientSequence = 0;
    this.emit({ type: "phase", phase: "connecting", detail: options.url });

    const ws = new WebSocket(options.url);
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
      this.emit({ type: "phase", phase: "authenticating", detail: "websocket open" });
      this.sendEnvelope({ authRequest: { ticket: options.ticket } }, "auth request");
    });

    ws.addEventListener("message", (event) => {
      void this.handleMessage(event.data);
    });

    ws.addEventListener("close", (event) => {
      if (this.ws !== ws) {
        return;
      }
      const detail = event.reason || `code ${event.code}`;
      this.ws = null;
      this.emit({ type: "phase", phase: "disconnected", detail });
      this.emit({ type: "log", level: "warn", message: `websocket closed (${detail})` });
    });

    ws.addEventListener("error", () => {
      if (this.ws !== ws) {
        return;
      }
      this.emit({ type: "phase", phase: "error", detail: "websocket error" });
      this.emit({ type: "log", level: "error", message: "websocket error" });
    });
  }

  disconnect(reason = "manual disconnect"): void {
    if (!this.ws) {
      return;
    }
    const ws = this.ws;
    this.ws = null;
    ws.close(1000, reason);
    this.emit({ type: "phase", phase: "disconnected", detail: reason });
  }

  reconnect(): void {
    if (!this.options) {
      this.emit({ type: "log", level: "warn", message: "no previous connection settings" });
      return;
    }
    this.connect({ ...this.options, lastSeenRevision: this.activeRevision });
  }

  requestSnapshot(): void {
    const roomId = this.activeRoomId || this.options?.roomId || "";
    this.sendEnvelope(
      {
        snapshotRequest: {
          roomId,
          lastSeenRevision: this.activeRevision || "0",
        },
      },
      "snapshot request",
    );
  }

  sendMove(moveUci: string, strictRevision: boolean): void {
    this.sendGameCommand(
      {
        doMove: {
          moveUci: moveUci.trim().toLowerCase(),
        },
      },
      strictRevision,
      `move ${moveUci.trim().toLowerCase()}`,
    );
  }

  resign(strictRevision: boolean): void {
    this.sendGameCommand({ resign: {} }, strictRevision, "resign");
  }

  offerDraw(strictRevision: boolean): void {
    this.sendGameCommand({ offerDraw: {} }, strictRevision, "offer draw");
  }

  ping(): void {
    this.sendEnvelope({ ping: { clientTimeUnixMs: Date.now() } }, "ping");
  }

  private sendGameCommand(
    command: { doMove?: { moveUci: string }; resign?: Record<string, never>; offerDraw?: Record<string, never> },
    strictRevision: boolean,
    label: string,
  ): void {
    const roomId = this.activeRoomId || this.options?.roomId || "";
    this.sendEnvelope(
      {
        gameCommand: {
          roomId,
          expectedRevision: strictRevision ? this.activeRevision || "0" : "0",
          ...command,
        },
      },
      label,
    );
  }

  private sendEnvelope(payload: Parameters<typeof encodeClientEnvelope>[1], label: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit({ type: "log", level: "warn", message: `cannot send ${label}: socket is not open` });
      return;
    }
    this.clientSequence += 1;
    try {
      const bytes = encodeClientEnvelope(this.clientSequence, payload);
      this.ws.send(bytes);
      this.emit({ type: "log", level: "info", message: `sent #${this.clientSequence}: ${label}` });
    } catch (error) {
      this.emit({ type: "log", level: "error", message: errorMessage(error) });
    }
  }

  private async handleMessage(data: unknown): Promise<void> {
    try {
      const buffer = await dataToArrayBuffer(data);
      const envelope = decodeServerEnvelope(buffer);
      this.handlePayload(envelope.payload, envelope.serverSequence);
    } catch (error) {
      this.emit({ type: "log", level: "error", message: errorMessage(error) });
    }
  }

  private handlePayload(payload: ServerPayload, serverSequence: string): void {
    switch (payload.kind) {
      case "authOk":
        this.emit({ type: "auth", playerId: payload.value.playerId, displayName: payload.value.displayName });
        this.emit({ type: "phase", phase: "joining", detail: payload.value.playerId });
        this.sendEnvelope(
          {
            joinRoom: {
              roomId: this.options?.roomId ?? "",
              lastSeenRevision: this.options?.lastSeenRevision || "0",
            },
          },
          "join room",
        );
        break;
      case "authFailed":
        this.emit({ type: "phase", phase: "error", detail: payload.value.reason });
        this.emit({ type: "log", level: "error", message: `auth failed: ${payload.value.reason}` });
        break;
      case "joinRoomOk":
        this.activeRoomId = payload.value.roomId;
        this.activeRevision = payload.value.currentRevision;
        this.emit({ type: "join", roomId: payload.value.roomId, revision: payload.value.currentRevision });
        this.emit({ type: "phase", phase: "connected", detail: payload.value.roomId });
        this.requestSnapshot();
        break;
      case "stateSnapshot":
        this.activeRoomId = payload.value.roomId;
        this.activeRevision = payload.value.revision;
        this.emit({ type: "snapshot", snapshot: payload.value });
        break;
      case "stateDelta":
        this.activeRoomId = payload.value.roomId;
        this.activeRevision = payload.value.newRevision;
        this.emit({ type: "delta", delta: payload.value });
        this.emit({
          type: "log",
          level: "info",
          message: `server #${serverSequence}: ${commandLabel(payload.value.xiangqi?.commandType)} r${payload.value.previousRevision}->${payload.value.newRevision}`,
        });
        break;
      case "error":
        this.emit({ type: "server-error", code: payload.value.code, message: payload.value.message });
        break;
      case "pong":
        this.emit({ type: "log", level: "info", message: `pong server_time=${payload.value.serverTimeUnixMs}` });
        break;
      case "unknown":
        this.emit({ type: "log", level: "warn", message: `server #${serverSequence}: unknown payload` });
        break;
    }
  }
}

async function dataToArrayBuffer(data: unknown): Promise<ArrayBuffer> {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (data instanceof Blob) {
    return data.arrayBuffer();
  }
  throw new Error(`unsupported websocket payload type: ${typeof data}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
