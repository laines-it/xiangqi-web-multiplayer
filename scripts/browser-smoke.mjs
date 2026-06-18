import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chrome) {
  throw new Error("Chrome or Edge executable was not found");
}

const port = 9333;
const room = `codex-browser-${Date.now()}`;
const ticket = `mock:codex-browser-${Date.now()}`;
const profile = path.join(os.tmpdir(), `codex-chrome-${Date.now()}`);
const screenshot = path.resolve("browser-connected.png");

const child = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--window-size=1440,1000",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "http://127.0.0.1:5173/",
  ],
  { stdio: "ignore" },
);

try {
  const target = await waitForTarget();
  const client = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await sleep(1000);
    await client.send("Runtime.evaluate", {
      expression: connectExpression(ticket, room),
      awaitPromise: true,
    });
    const state = await waitForUiState(client, ticket, room);

    const shot = await client.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(screenshot, Buffer.from(shot.data, "base64"));

    const result = {
      ok: state.ok,
      room,
      ticket,
      phase: state.phase,
      player: state.player,
      red: state.red,
      status: state.status,
      latestLog: state.latestLog,
      screenshot,
    };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await client.send("Browser.close").catch(() => undefined);
  }
} finally {
  setTimeout(() => child.kill(), 500);
}

async function waitForTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((target) => target.type === "page");
      if (page) {
        return page;
      }
    } catch {
      // Chrome is still booting.
    }
    await sleep(250);
  }
  throw new Error("DevTools target timeout");
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();

    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const callId = ++id;
            pending.set(callId, { res, rej });
            ws.send(JSON.stringify({ id: callId, method, params }));
          });
        },
      });
    });

    ws.addEventListener("message", async (event) => {
      const raw =
        typeof event.data === "string"
          ? event.data
          : Buffer.from(await event.data.arrayBuffer()).toString("utf8");
      const message = JSON.parse(raw);
      if (!message.id || !pending.has(message.id)) {
        return;
      }
      const callbacks = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        callbacks.rej(new Error(JSON.stringify(message.error)));
      } else {
        callbacks.res(message.result);
      }
    });

    ws.addEventListener("error", () => reject(new Error("CDP websocket error")), { once: true });
  });
}

async function waitForUiState(client, expectedTicket, expectedRoom) {
  let lastState = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    lastState = await readUiState(client);
    if (
      lastState.phase.toLowerCase() === "connected" &&
      lastState.player === expectedTicket.replace(/^mock:/, "") &&
      lastState.red === expectedTicket.replace(/^mock:/, "") &&
      lastState.room.startsWith(expectedRoom.slice(0, 20)) &&
      lastState.status === "Active"
    ) {
      return { ...lastState, ok: true };
    }
    await sleep(500);
  }
  return { ...(lastState ?? {}), ok: false };
}

async function readUiState(client) {
  const result = await client.send("Runtime.evaluate", {
    expression: `(() => {
      const pairs = {};
      document.querySelectorAll(".status-grid div").forEach((node) => {
        const key = node.querySelector("dt")?.textContent?.trim();
        const value = node.querySelector("dd")?.textContent?.trim();
        if (key) pairs[key] = value;
      });
      return {
        phase: document.querySelector(".phase-pill")?.textContent?.trim() ?? "",
        room: pairs.Room ?? "",
        player: pairs.Player ?? "",
        red: pairs.Red ?? "",
        status: pairs.Status ?? "",
        latestLog: document.querySelector(".event-log li")?.textContent?.trim() ?? "",
      };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

function connectExpression(nextTicket, nextRoom) {
  return `(() => {
    const inputs = [...document.querySelectorAll("input")];
    const setInput = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    setInput(inputs[1], ${JSON.stringify(nextTicket)});
    setInput(inputs[2], ${JSON.stringify(nextRoom)});
    document.querySelector("button[title='Connect']").click();
  })()`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
