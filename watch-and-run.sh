#!/usr/bin/env bash
# watch-and-run.sh — run the commands in a text file, then re-run them
# only when the file's contents change.
#
# Usage:
#   ./watch-and-run.sh commands.txt            # run in the foreground
#   nohup ./watch-and-run.sh commands.txt &    # run in the background
#
# Options (environment variables):
#   INTERVAL=2         seconds between checks (default 2)
#   LOG=watch.log      where command output goes (default: stdout)

set -u

FILE="${1:-}"
INTERVAL="${INTERVAL:-2}"

if [[ -z "$FILE" ]]; then
  echo "Usage: $0 <file-to-watch>" >&2
  exit 1
fi

if [[ -n "${LOG:-}" ]]; then
  exec >>"$LOG" 2>&1
fi

# Hash of the file's contents (empty if the file is missing).
fingerprint() {
  if [[ -f "$FILE" ]]; then
    cksum < "$FILE"
  else
    echo "missing"
  fi
}

run_file() {
  echo "=== [$(date '+%Y-%m-%d %H:%M:%S')] Running $FILE ==="
  bash "$FILE"
  local rc=$?
  echo "=== [$(date '+%Y-%m-%d %H:%M:%S')] Finished (exit code $rc) ==="
}

trap 'echo "Stopping watcher."; exit 0' INT TERM

echo "Watching $FILE every ${INTERVAL}s (PID $$)"
last=""

while true; do
  current="$(fingerprint)"
  if [[ "$current" != "$last" ]]; then
    last="$current"
    if [[ "$current" == "missing" ]]; then
      echo "[$(date '+%H:%M:%S')] $FILE not found; waiting for it to appear..."
    else
      run_file
    fi
  fi
  sleep "$INTERVAL"
done
