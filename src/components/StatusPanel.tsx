import { GameStatus, sideLabel, statusLabel, XiangqiSide } from "../protocol/ruleshiftProtocol";

interface StatusPanelProps {
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
}

export function StatusPanel({
  roomId,
  playerId,
  displayName,
  redPlayerId,
  blackPlayerId,
  revision,
  stateHash,
  sideToMove,
  status,
  fen,
  winnerPlayerId,
  drawOfferedByPlayerId,
}: StatusPanelProps): JSX.Element {
  return (
    <section className="panel status-panel">
      <div className="panel-title-row">
        <h2>Status</h2>
        <span className={`side-pill side-${sideLabel(sideToMove).toLowerCase()}`}>{sideLabel(sideToMove)}</span>
      </div>
      <dl className="status-grid">
        <StatusValue label="Room" value={roomId || "-"} />
        <StatusValue label="Player" value={playerId || "-"} />
        <StatusValue label="Name" value={displayName || "-"} />
        <StatusValue label="Red" value={redPlayerId || "-"} />
        <StatusValue label="Black" value={blackPlayerId || "-"} />
        <StatusValue label="Revision" value={revision || "0"} />
        <StatusValue label="Hash" value={stateHash || "0"} />
        <StatusValue label="Status" value={statusLabel(status)} />
        <StatusValue label="Winner" value={winnerPlayerId || "-"} />
        <StatusValue label="Draw offer" value={drawOfferedByPlayerId || "-"} />
      </dl>
      <div className="fen-box">
        <span>Latest FEN</span>
        <code>{fen}</code>
      </div>
    </section>
  );
}

function StatusValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
