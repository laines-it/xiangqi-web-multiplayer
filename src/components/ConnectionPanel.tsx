import { Plug, Power, RefreshCcw, RotateCcw } from "lucide-react";
import { ConnectionPhase } from "../network/RuleshiftSocket";

interface ConnectionPanelProps {
  serverUrl: string;
  ticket: string;
  roomId: string;
  phase: ConnectionPhase;
  onServerUrlChange: (value: string) => void;
  onTicketChange: (value: string) => void;
  onRoomIdChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}

export function ConnectionPanel({
  serverUrl,
  ticket,
  roomId,
  phase,
  onServerUrlChange,
  onTicketChange,
  onRoomIdChange,
  onConnect,
  onDisconnect,
  onReconnect,
}: ConnectionPanelProps): JSX.Element {
  const connected = phase === "connected" || phase === "joining" || phase === "authenticating";

  return (
    <section className="panel connection-panel">
      <div className="panel-title-row">
        <h2>Connection</h2>
        <span className={`phase-pill ${phase}`}>{phase}</span>
      </div>
      <label className="field">
        <span>Server URL</span>
        <input value={serverUrl} onChange={(event) => onServerUrlChange(event.target.value)} spellCheck={false} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Ticket</span>
          <input value={ticket} onChange={(event) => onTicketChange(event.target.value)} spellCheck={false} />
        </label>
        <label className="field">
          <span>Room</span>
          <input value={roomId} onChange={(event) => onRoomIdChange(event.target.value)} spellCheck={false} />
        </label>
      </div>
      <div className="button-row">
        <button type="button" className="primary-button" onClick={onConnect} title="Connect">
          <Plug size={18} />
          <span>Connect</span>
        </button>
        <button type="button" onClick={onDisconnect} disabled={!connected} title="Disconnect">
          <Power size={18} />
        </button>
        <button type="button" onClick={onReconnect} title="Reconnect">
          <RefreshCcw size={18} />
        </button>
        <button type="button" onClick={() => window.location.reload()} title="Reload app">
          <RotateCcw size={18} />
        </button>
      </div>
    </section>
  );
}
