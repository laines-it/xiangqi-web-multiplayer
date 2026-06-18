export interface LogEntry {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

interface EventLogProps {
  entries: LogEntry[];
}

export function EventLog({ entries }: EventLogProps): JSX.Element {
  return (
    <section className="panel log-panel">
      <div className="panel-title-row">
        <h2>Event Log</h2>
        <span>{entries.length}</span>
      </div>
      <ol className="event-log">
        {entries.map((entry) => (
          <li className={`log-entry ${entry.level}`} key={entry.id}>
            <time>{entry.at}</time>
            <span>{entry.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
