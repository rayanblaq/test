// Simple text-to-file web app — no external dependencies.
// Run with:  node server.js
// Then open: http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;

// The single file everything gets appended to. Users never control this path.
const DATA_FILE = path.join(__dirname, "notes.txt");

// Safety limits
const MAX_ENTRY_BYTES = 10 * 1024;        // 10 KB per submission
const MAX_FILE_BYTES = 5 * 1024 * 1024;   // 5 MB total, then we stop accepting

// --- helpers ---------------------------------------------------------------

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readEntries() {
  try {
    return fs.readFileSync(DATA_FILE, "utf8");
  } catch {
    return "";
  }
}

function page(message) {
  const contents = readEntries();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Text saver</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; }
    textarea { width: 100%; height: 120px; box-sizing: border-box; padding: 8px; font: inherit; }
    button { margin-top: 8px; padding: 8px 16px; font: inherit; cursor: pointer; }
    .msg { color: #2a7; margin: 8px 0; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; }
    h2 { margin-top: 32px; }
  </style>
</head>
<body>
  <h1>Save some text</h1>
  ${message ? `<p class="msg">${escapeHtml(message)}</p>` : ""}
  <form method="POST" action="/save">
    <textarea name="text" maxlength="${MAX_ENTRY_BYTES}" placeholder="Type something..." required></textarea>
    <br>
    <button type="submit">Save to file</button>
  </form>

  <h2>Saved so far</h2>
  <pre>${contents ? escapeHtml(contents) : "(nothing yet)"}</pre>
</body>
</html>`;
}

function parseFormField(body, field) {
  // application/x-www-form-urlencoded parsing for a single field
  const params = new URLSearchParams(body);
  return params.get(field) || "";
}

// --- server ----------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page(""));
    return;
  }

  if (req.method === "POST" && req.url === "/save") {
    let body = "";
    let tooBig = false;

    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_ENTRY_BYTES * 2) {
        tooBig = true;
        req.destroy();
      }
    });

    req.on("end", () => {
      if (tooBig) {
        res.writeHead(413, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("That was too large — submission rejected."));
        return;
      }

      let text = parseFormField(body, "text").trim();

      if (!text) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Nothing to save."));
        return;
      }

      if (Buffer.byteLength(text) > MAX_ENTRY_BYTES) {
        text = text.slice(0, MAX_ENTRY_BYTES);
      }

      // Stop growing the file past the cap.
      let currentSize = 0;
      try {
        currentSize = fs.statSync(DATA_FILE).size;
      } catch {}

      if (currentSize >= MAX_FILE_BYTES) {
        res.writeHead(507, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page("Storage is full — nothing more can be saved."));
        return;
      }

      const entry = `[${new Date().toISOString()}]\n${text}\n\n`;
      fs.appendFileSync(DATA_FILE, entry);

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page("Saved!"));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
  console.log(`Text is saved to: ${DATA_FILE}`);
});
