#!/bin/bash
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { printf "${GREEN}  [OK]${RESET}   %s\n"   "$*"; }
fail() { printf "${RED}  [FAIL]${RESET} %s\n"  "$*" >&2; exit 1; }
warn() { printf "${YELLOW}  [WARN]${RESET} %s\n"  "$*"; }
info() { printf "${CYAN}  -->  ${RESET}%s\n"    "$*"; }
hdr()  { printf "\n${BOLD}%s${RESET}\n" "$*"; }

hdr "=== KaraokeEternal startup check ==="

# ---------------------------------------------------------------------------
# Dependency checks
# ---------------------------------------------------------------------------
hdr "Dependencies"

check_dep() {
  local label="$1"
  local bin="$2"
  local ver_cmd="$3"

  if ! command -v "$bin" > /dev/null 2>&1; then
    fail "$label — '$bin' not found on PATH"
  fi
  local ver
  ver=$(eval "$ver_cmd" 2>/dev/null | head -1) || ver="(version unknown)"
  ok "$label — $ver"
}

check_dep "node"    "node"    "node --version"
check_dep "npm"     "npm"     "npm --version"
check_dep "python3" "python3" "python3 --version"
check_dep "ffmpeg"  "ffmpeg"  "ffmpeg -version 2>&1 | head -1"
check_dep "yt-dlp"  "yt-dlp"  "yt-dlp --version"
check_dep "deno"    "deno"    "deno --version | head -1"
check_dep "curl"    "curl"    "curl --version | head -1"
check_dep "zip"     "zip"     "zip --version 2>&1 | grep -i 'zip [0-9]' | head -1"
check_dep "unzip"   "unzip"   "unzip -v 2>&1 | head -1"

# spleeter is a Python package, not always on PATH as a binary
if python3 -c "import spleeter" 2>/dev/null; then
  ver=$(pip3 show spleeter 2>/dev/null | awk '/^Version:/ {print $2}')
  ok "spleeter (python module) — ${ver:-installed}"
else
  fail "spleeter — Python module not found (pip3 install spleeter)"
fi

# ---------------------------------------------------------------------------
# Spleeter 2-stems model
# ---------------------------------------------------------------------------
hdr "Spleeter model"

SPLEETER_DATA="${SPLEETER_DATA:-/data/spleeter}"
MODEL_DIR="${SPLEETER_DATA}/pretrained_models/2stems"
MODEL_URL="https://github.com/deezer/spleeter/releases/download/v1.4.0/2stems.tar.gz"

if [ -d "${MODEL_DIR}" ] && [ -n "$(ls -A "${MODEL_DIR}" 2>/dev/null)" ]; then
  ok "2-stems model present — ${MODEL_DIR}"
else
  warn "2-stems model not found — downloading to ${MODEL_DIR}"
  mkdir -p "${MODEL_DIR}"
  info "Fetching ${MODEL_URL} ..."
  if curl -fsSL "${MODEL_URL}" | tar -xz --strip-components=1 -C "${MODEL_DIR}"; then
    if [ -n "$(ls -A "${MODEL_DIR}" 2>/dev/null)" ]; then
      ok "2-stems model downloaded successfully"
    else
      fail "Download appeared to succeed but model directory empty at ${MODEL_DIR}"
    fi
  else
    fail "Failed to download 2-stems model from ${MODEL_URL}"
  fi
fi

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
hdr "Environment"

ok "NODE_ENV       = ${NODE_ENV:-<unset>}"
ok "KES_PATH_DATA  = ${KES_PATH_DATA:-<unset>}"
ok "KES_PORT       = ${KES_PORT:-<unset>}"
ok "SPLEETER_DATA  = ${SPLEETER_DATA}"

if [ -n "${KES_YOUTUBE_API_KEY:-}" ]; then
  ok "KES_YOUTUBE_API_KEY = <set>"
else
  warn "KES_YOUTUBE_API_KEY = <unset> (YouTube search disabled until set via admin UI)"
fi

# Map LOG_LEVEL string to numeric level (0=off 1=error 2=warn 3=info 4=verbose 5=debug)
NODE_ARGS=()
if [ -n "${LOG_LEVEL:-}" ]; then
  case "${LOG_LEVEL,,}" in
    off)     _LEVEL=0 ;;
    error)   _LEVEL=1 ;;
    warn)    _LEVEL=2 ;;
    info)    _LEVEL=3 ;;
    verbose) _LEVEL=4 ;;
    debug)   _LEVEL=5 ;;
    [0-5])   _LEVEL="${LOG_LEVEL}" ;;
    *)       warn "LOG_LEVEL '${LOG_LEVEL}' unrecognized — ignoring (use: off/error/warn/info/verbose/debug or 0-5)"; _LEVEL="" ;;
  esac
  if [ -n "${_LEVEL:-}" ]; then
    NODE_ARGS+=(--serverConsoleLevel "${_LEVEL}" --scannerConsoleLevel "${_LEVEL}")
    ok "LOG_LEVEL      = ${LOG_LEVEL} → level ${_LEVEL}"
  fi
else
  ok "LOG_LEVEL      = <unset> (using defaults)"
fi

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
hdr "Starting KaraokeEternal"
info "exec node build/server/main.js ${NODE_ARGS[*]+"${NODE_ARGS[*]}"}"
echo ""

exec node build/server/main.js "${NODE_ARGS[@]}"
