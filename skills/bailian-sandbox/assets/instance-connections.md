# Connect to a Sandbox instance

Use this guide when the user asks to access an instance, open WebShell, automate its browser, or view the live desktop. Lifecycle operations stay in `bl sandbox`; runtime access uses the returned connection information with HTTP, CDP, or VNC clients.

## Official documentation and endpoint ownership

- [Bailian Sandbox SDK](https://docs.agent.bailian.aliyun.com/zh/sandbox/sdk) ([Markdown](https://docs.agent.bailian.aliyun.com/zh/sandbox/sdk.md)) — separates control-plane operations from runtime access; documents command execution through `POST /process.Process/Start`.
- [Browser template](https://help.aliyun.com/en/functioncompute/browser-template) — the **WebSocket endpoints** section defines port 3000, `/health`, `/ws/automation`, `/ws/livestream`, and `X-Access-Token` authentication.
- [Use Browser Use Sandbox](https://help.aliyun.com/en/functioncompute/use-browser-use-sandbox) — browser readiness, Puppeteer / BrowserUse integration, page navigation, and screenshots.
- [Connect protocol](https://connectrpc.com/docs/protocol/) — streaming envelopes, unary JSON requests, and end-of-stream errors used by envd.

The browser paths below belong to the official browser image, not to every Sandbox template. Custom images or gateways may have different ports and paths; check their contract before constructing a URL. The envd PTY payloads below were verified with Bailian `envdVersion=0.2.4`; use the returned version when diagnosing compatibility changes.

## 1. Obtain connection information

Reuse the requested instance. Create one only when creation is part of the user's request. Follow the shared protocol before running `bl`; use the generated command reference for lifecycle flags.

Capture the credential-bearing result in a private temporary directory:

```bash
umask 077
sandbox_connection_dir="$(mktemp -d)"
bl sandbox get --sandbox-id <sandbox-id> --show-credentials --output json > "$sandbox_connection_dir/connection.json"
```

Check the command exit code before reading the file. `create` and `connect` can also return connection fields with `--show-credentials`, but neither command opens a terminal or browser. Without that flag, tokens are `[REDACTED]` and cannot authenticate a runtime request.

| Returned field                  | Use                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `envdUrl`                       | Runtime base URL for WebShell / process RPCs; use it directly.                                                                 |
| `envdAccessToken`               | Value for the runtime `X-Access-Token` header; not the Bailian API Key.                                                        |
| `sandboxID`, `domain`           | Construct a documented service host as `{port}-{sandboxID}.{domain}`. Use `sandboxID`, not `bailianSandboxId` or `templateID`. |
| `state`, `endAt`, `envdVersion` | Check readiness, expiry, and the runtime version.                                                                              |
| `trafficAccessToken`            | Separate optional credential; do not substitute it for `envdAccessToken` in the flows below.                                   |

Require a running instance and a usable token. If it is paused, resume only within the requested scope, then fetch fresh connection information. If it has expired or no longer exists, report that state rather than retrying an old token or silently creating a replacement. Do not hardcode a previously observed domain, instance ID, or token.

## 2. Check the intended service

For the official browser template, set `browserHost = "3000-" + sandboxID + "." + domain`.

| Capability                | Address                             | Transport                  |
| ------------------------- | ----------------------------------- | -------------------------- |
| envd readiness            | `{envdUrl}/health`                  | HTTPS GET                  |
| WebShell / shell commands | `{envdUrl}/process.Process/Start`   | HTTPS POST, Connect stream |
| Browser readiness         | `https://{browserHost}/health`      | HTTPS GET                  |
| Browser automation        | `wss://{browserHost}/ws/automation` | CDP over WebSocket         |
| Live browser desktop      | `wss://{browserHost}/ws/livestream` | VNC / RFB over WebSocket   |

Send `X-Access-Token: <envdAccessToken>` on each request. The control-plane `Authorization: Bearer <Bailian API Key>` is not this data-plane header. Do not send the Bailian API Key to runtime service hosts.

This Python example uses only the standard library and keeps the token out of command arguments and output. It checks envd and, for a browser instance, the browser service:

```bash
python3 - "$sandbox_connection_dir/connection.json" <<'PYTHON'
import json
import sys
import urllib.request
from pathlib import Path

connection = json.loads(Path(sys.argv[1]).read_text())
token = connection.get("envdAccessToken")
if not token or token == "[REDACTED]":
    raise SystemExit("Fetch connection information with --show-credentials first")
browser_host = f"3000-{connection['sandboxID']}.{connection['domain']}"
for base_url in [connection["envdUrl"], f"https://{browser_host}"]:
    request = urllib.request.Request(
        base_url.rstrip("/") + "/health",
        headers={"X-Access-Token": token},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        print(base_url, response.status, response.read(1024).decode())
PYTHON
```

An authenticated `/health` response of 200 establishes service readiness only. A root-path `/` response of 404 does not prove that the runtime is unavailable; these endpoints need not serve an HTML homepage. For a newly starting browser service, retry health checks with a bounded deadline before opening CDP or VNC.

## 3. Open WebShell through envd PTY

Use a terminal client or a host-side page with a terminal emulator such as xterm.js. Reuse an available envd client instead of recreating the protocol when possible.

1. POST to `{envdUrl}/process.Process/Start` with `X-Access-Token`, `Connect-Protocol-Version: 1`, `Content-Type: application/connect+json`, and `connect-content-encoding: identity`.
2. Encode the JSON payload below in a Connect envelope: one zero flags byte, a four-byte big-endian payload length, then the UTF-8 JSON bytes. This is not a plain JSON POST.

```json
{
  "process": {
    "cmd": "/bin/bash",
    "args": ["--noprofile", "--norc", "-i"],
    "envs": { "TERM": "xterm-256color" }
  },
  "pty": { "size": { "cols": 100, "rows": 30 } }
}
```

Choose a shell available in the image; the browser image used here has `/bin/bash`. Consume the response incrementally instead of waiting for the interactive process to finish:

- Save `event.start.pid` as the process handle.
- Decode Base64 `event.data.pty` into bytes and write them to the terminal; preserve multibyte characters across chunks. For non-PTY processes, output may use `stdout` / `stderr` instead.
- Handle `event.end.exitCode`. Frames whose flags contain `0x02` are end-of-stream frames; report their `error` even when HTTP status is 200. Buffer incomplete frames across network chunks.

Subsequent requests use `Content-Type: application/json` and the same token and protocol-version headers, without a streaming envelope:

| Action                                      | POST path under `envdUrl`     | JSON body                                                       |
| ------------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Send keyboard input                         | `/process.Process/SendInput`  | `{"process":{"pid":123},"input":{"pty":"cHdkDQ=="}}`            |
| Resize the terminal                         | `/process.Process/Update`     | `{"process":{"pid":123},"pty":{"size":{"cols":100,"rows":30}}}` |
| Terminate this shell on explicit disconnect | `/process.Process/SendSignal` | `{"process":{"pid":123},"signal":"SIGNAL_SIGKILL"}`             |

Replace `123` with the returned PID. `cHdkDQ==` is Base64 for `pwd` followed by a carriage return. Serialize keyboard input requests to preserve their order. A WebShell frontend maps terminal input to `SendInput`, terminal resize to `Update`, and streamed output back to the terminal. Abort streaming requests and clean up only the shell process created by that client when disconnecting; do not kill the sandbox or the browser stack.

Verify the interactive path by typing `pwd` in the terminal and observing the result and a new prompt. A successful `Start` response alone does not verify keyboard input. In a page that wraps global `fetch`, use an unwrapped streaming client or a local proxy if the wrapper buffers the stream.

## 4. Connect browser automation through CDP

Use a WebSocket client that supports custom headers. With `puppeteer-core` available in a scratch project, save the following as `connect-browser.mjs` there and run `node connect-browser.mjs <connection.json> <target-url> <screenshot.png>`. The browser runs in the sandbox; no local Chromium installation or E2B SDK is needed for this direct connection.

```javascript
import { readFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const [connectionPath, targetUrl, screenshotPath] = process.argv.slice(2);
if (!connectionPath || !targetUrl || !screenshotPath) {
  throw new Error("Expected connection.json, target URL, and screenshot path");
}
const connection = JSON.parse(await readFile(connectionPath, "utf8"));
const browserHost = `3000-${connection.sandboxID}.${connection.domain}`;
const browser = await puppeteer.connect({
  browserWSEndpoint: `wss://${browserHost}/ws/automation`,
  headers: { "X-Access-Token": connection.envdAccessToken },
});
try {
  const page = await browser.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.screenshot({ path: screenshotPath });
  console.log(JSON.stringify({ url: page.url(), title: await page.title(), screenshotPath }));
} finally {
  browser.disconnect();
}
```

Run the health/token checks first. Use the user's requested target; if they only ask for an access check, `https://example.com` is a suitable sample. Verify the page title and screenshot. Disconnecting the client leaves the remote browser available; do not copy tutorial cleanup that closes the browser or kills a sandbox the user wants to keep using.

## 5. Show the live browser desktop through VNC

Connect a noVNC client to `wss://{browserHost}/ws/livestream`. This endpoint carries VNC frames, not CDP messages or an HTML page. A WebSocket handshake alone does not establish a working desktop; verify that the client finishes the RFB handshake and renders the remote browser.

Browser-native WebSocket cannot attach `X-Access-Token` headers. For a user-facing page, use a header-capable bridge: browser noVNC → local WebSocket proxy → sandbox VNC endpoint. Keep the token on the proxy side and attach it only to the sandbox request. Do not put it in page source or query parameters to work around header support.

For a temporary local viewer, bind to `127.0.0.1`, check the WebSocket Origin, and forward only the selected instance's service. Serve the needed noVNC assets from an available dependency or a scratch install. The same local approach can bridge an xterm.js WebShell page to envd. Keep the proxy running while the user is using the page; stop its connections when the instance expires or the user finishes.

Report the actual local page URL separately from the remote service URL. Open the page when requested, verify the connected state and visible desktop or terminal output, and retain the usable tab for the user. State that a loopback URL works only on this machine and report the instance's actual expiry from `endAt`. Do not treat `127.0.0.1` pages as addresses returned by `sandbox get`.
