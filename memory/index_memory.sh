#!/usr/bin/env bash
set -u
: "${ELLE_MEMORY_INDEX_DIR:?Set ELLE_MEMORY_INDEX_DIR to your index directory}"
OPENCLAW_BIN="${OPENCLAW_BIN:-openclaw}"
AGENT="${ELLE_MEMORY_AGENT:-qqgroup}"
INDEX_DIR="$(realpath -- "$ELLE_MEMORY_INDEX_DIR")"
if [[ ! -d "$INDEX_DIR" || "$INDEX_DIR" == / || "$INDEX_DIR" == "$HOME" ]]; then
  echo 'Choose an existing, dedicated index directory' >&2; exit 2
fi
if [[ ! "$AGENT" =~ ^[A-Za-z0-9_-]+$ ]]; then echo 'Invalid agent ID' >&2; exit 2; fi
LOG_FILE="$INDEX_DIR/index_rebuild.log"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG_FILE"; }
exec 9>"$INDEX_DIR/.index_rebuild.lock"
if ! flock -n 9; then log 'skipped: previous index run still active'; exit 0; fi
if [[ "${1:-}" == '--prune-orphans' ]]; then
  find "$INDEX_DIR" -maxdepth 1 -type f -name "$AGENT.sqlite.tmp-*" -mtime +1 -delete
fi
log 'index run start'
timeout "${ELLE_INDEX_TIMEOUT_SECONDS:-600}" "$OPENCLAW_BIN" memory index --agent "$AGENT" >> "$LOG_FILE" 2>&1
rc=$?
log "index run end rc=$rc"
exit "$rc"
