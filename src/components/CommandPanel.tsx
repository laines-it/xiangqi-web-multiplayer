import { Flag, Handshake, RefreshCcw, Send, Waves } from "lucide-react";

interface CommandPanelProps {
  moveInput: string;
  strictRevision: boolean;
  disabled: boolean;
  onMoveInputChange: (value: string) => void;
  onSubmitMove: () => void;
  onSnapshot: () => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onPing: () => void;
  onStrictRevisionChange: (value: boolean) => void;
}

export function CommandPanel({
  moveInput,
  strictRevision,
  disabled,
  onMoveInputChange,
  onSubmitMove,
  onSnapshot,
  onResign,
  onOfferDraw,
  onPing,
  onStrictRevisionChange,
}: CommandPanelProps): JSX.Element {
  return (
    <section className="panel command-panel">
      <div className="panel-title-row">
        <h2>Commands</h2>
        <label className="toggle">
          <input
            checked={strictRevision}
            onChange={(event) => onStrictRevisionChange(event.target.checked)}
            type="checkbox"
          />
          <span>Strict revision</span>
        </label>
      </div>
      <form
        className="move-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmitMove();
        }}
      >
        <label className="field">
          <span>Move UCI</span>
          <input
            value={moveInput}
            onChange={(event) => onMoveInputChange(event.target.value)}
            placeholder="h2e2"
            spellCheck={false}
            maxLength={4}
          />
        </label>
        <button type="submit" className="primary-button" disabled={disabled} title="Send move">
          <Send size={18} />
          <span>Move</span>
        </button>
      </form>
      <div className="button-row command-buttons">
        <button type="button" onClick={onSnapshot} disabled={disabled} title="Get snapshot">
          <RefreshCcw size={18} />
          <span>Snapshot</span>
        </button>
        <button type="button" onClick={onOfferDraw} disabled={disabled} title="Offer draw">
          <Handshake size={18} />
          <span>Draw</span>
        </button>
        <button type="button" onClick={onResign} disabled={disabled} title="Resign">
          <Flag size={18} />
          <span>Resign</span>
        </button>
        <button type="button" onClick={onPing} disabled={disabled} title="Ping">
          <Waves size={18} />
        </button>
      </div>
    </section>
  );
}
