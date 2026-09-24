// Git-file viewer web app — no external npm dependencies (requires `git` installed).
// Every POLL_INTERVAL it syncs a repo, reads one text file from it, and writes
// that text to notes.txt. The web page shows the latest content.
//
// Run with:  REPO_URL=https://github.com/you/repo REPO_FILE=README.md node server.js
// Then open: http://localhost:3000

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 3000;

// --- config: what to pull, and which file inside it to show -----------------
const REPO_URL = process.env.REPO_URL || "";          // e.g. https://github.com/you/repo.git
const REPO_FILE = process.env.REPO_FILE || "README.md"; // path to a text file within the repo
const REPO_BRANCH = process.env.REPO_BRANCH || "";     // optional; empty = default branch
const POLL_INTERVAL_MS = 10 * 1000;                    // 10 seconds

const CHECKOUT_DIR = path.join(__dirname, "repo-checkout");
const DATA_FILE = path.join(__dirname, "notes.txt");
const MAX_FILE_BYTES = 5 * 1024 * 1024;                // don't display absurdly large files

let lastContent = "(nothing fetched yet)";
let lastUpdated = null;
let lastError = null;

// --- helpers ---------------------------------------------------------------

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Run git safely: arguments passed as an array (no shell), with a timeout,
// and terminal prompts disabled so it fails fast instead of hanging on auth.
function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 30 * 1000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      }
    );
  });
}

async function syncRepo() {
  if (!REPO_URL) {
    lastError = "REPO_URL is not set. Start with REPO_URL=... node server.js";
    return;
  }

  try {
    if (!fs.existsSync(path.join(CHECKOUT_DIR, ".git"))) {
      // First time: clone.
      const cloneArgs = ["clone", "--depth", "1"];
      if (REPO_BRANCH) cloneArgs.push("--branch", REPO_BRANCH);
      cloneArgs.push(REPO_URL, CHECKOUT_DIR);
      await runGit(cloneArgs, __dirname);
    } else {
      // Subsequent times: fetch + hard reset to the remote tip.
      await runGit(["fetch", "--depth", "1", "origin"], CHECKOUT_DIR);
      const ref = REPO_BRANCH ? `origin/${REPO_BRANCH}` : "origin/HEAD";
      await runGit(["reset", "--hard", ref], CHECKOUT_DIR);
    }

    // Resolve the target file *inside* the checkout, and refuse anything that
    // escapes it (so REPO_FILE can't point at, say, ../../etc/passwd).
    const target = path.resolve(CHECKOUT_DIR, REPO_FILE);
    if (target !== CHECKOUT_DIR && !target.startsWith(CHECKOUT_DIR + path.sep)) {
      throw new Error(`REPO_FILE resolves outside the repo: ${REPO_FILE}`);
    }

    const stat = fs.statSync(target);
    if (stat.size > MAX_FILE_BYTES) {
      throw new Error(`File is too large to display (${stat.size} bytes).`);
    }

    const text = fs.readFileSync(target, "utf8");
    fs.writeFileSync(DATA_FILE, text);   // mirror to notes.txt
    lastContent = text;
    lastUpdated = new Date();
    lastError = null;
  } catch (e) {
    lastError = e.message;
  }
}

function page() {
  const when = lastUpdated ? lastUpdated.toISOString() : "never";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="10">
  <title>Repo file viewer</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; }
    pre { background: #f4f4f4; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; }
    .meta { color: #666; font-size: 0.9em; }
    .err { color: #c33; }
  </style>
</head>
<body>
  <h1>${escapeHtml(REPO_FILE)}</h1>
  <p class="meta">
    Source: ${escapeHtml(REPO_URL || "(REPO_URL not set)")}<br>
    Last updated: ${escapeHtml(when)} &middot; refreshes every 10s
  </p>
  ${lastError ? `<p class="err">Last sync error: ${escapeHtml(lastError)}</p>` : ""}
  <pre>${escapeHtml(lastContent)}</pre>
</body>
</html>`;
}

// --- server ----------------------------------------------------------------

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page());
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Running at http://localhost:${PORT}`);
  console.log(`Watching ${REPO_FILE} in ${REPO_URL || "(REPO_URL not set)"}`);
  console.log(`Mirroring to: ${DATA_FILE}`);
  syncRepo();                                   // fetch immediately on start
  setInterval(syncRepo, POLL_INTERVAL_MS);      // then every 10s
});
