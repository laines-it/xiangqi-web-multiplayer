# xiangqi-web-multiplayer

Browser multiplayer Xiangqi client for the Ruleshift Go server. The client talks to the gateway at `wss://api.xiangqi-russia.ru/ws` using WebSocket binary frames where every outbound payload is a protobuf `ClientEnvelope` and every inbound payload is decoded as a `ServerEnvelope`.

## Stack

- Vite
- TypeScript
- React
- `protobufjs` runtime parsing of `src/protocol/ruleshift.proto`
- Plain CSS

## Protocol Contract

The protocol file is copied from the server repository:

```text
Ruleshift/server/internal/protocol/proto/ruleshift.proto
```

Reference docs and behavior:

```text
Ruleshift/server/docs/protocol.md
Ruleshift/server/docs/cli-client.md
Ruleshift/server/cmd/client/main.go
Ruleshift/server/cmd/console/main.go
```

Current protocol version is `1`, matching `internal/protocol/codec.go` in the server repository.

To update the contract, replace:

```text
src/protocol/ruleshift.proto
```

The app imports it with Vite's `?raw` loader and parses it at runtime with `protobufjs`, so no generated TypeScript file is required. If you decide to switch to generated bindings later, a practical path is `protobufjs-cli`:

```powershell
npm install --save-dev protobufjs-cli
npx pbjs -t static-module -w es6 -o src/protocol/ruleshift.pb.js src/protocol/ruleshift.proto
npx pbts -o src/protocol/ruleshift.pb.d.ts src/protocol/ruleshift.pb.js
```

## Run Locally

```powershell
npm install
npm run dev
```

The default connection values in the UI are:

```text
Server URL: wss://api.xiangqi-russia.ru/ws
Ticket:     mock:player-1
Room:       demo
```

Build:

```powershell
npm run build
```

## Two Browser Clients

1. Open the Vite URL in one tab.
2. Use `mock:player-1`, room `demo`, and connect.
3. Open the same Vite URL in a second tab.
4. Use `mock:player-2`, room `demo`, and connect.
5. Send a move such as `h2e2` from the first tab, then `h7e7` from the second tab.

Both tabs stay connected and update from `StateDelta` messages without refreshing. The Snapshot button sends `SnapshotRequest` for recovery.

## Notes

- `GameCommand.expected_revision` is `0` by default, matching the server CLI behavior.
- Enable Strict revision in the UI to send the latest local room revision with commands.
- Board clicks produce UCI moves from source square to target square.
- Server `ErrorMessage` payloads are shown in the event log.
