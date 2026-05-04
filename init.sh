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

export SPLEETER_DATA="${SPLEETER_DATA:-${KES_PATH_DATA:-/data}/spleeter}"
export SPLEETER_MODEL="${SPLEETER_MODEL:-2stems}"

case "${SPLEETER_MODEL}" in
  2stems|2stems-finetune) ;;
  *) fail "SPLEETER_MODEL '${SPLEETER_MODEL}' invalid — use: 2stems or 2stems-finetune" ;;
esac

MODEL_DIR="${SPLEETER_DATA}/pretrained_models/${SPLEETER_MODEL}"
CACHE_DIR="${SPLEETER_CACHE:-/tmp/spleeter-cache}"
TARBALL="${CACHE_DIR}/${SPLEETER_MODEL}.tar.gz"
TARBALL_SHA="${CACHE_DIR}/${SPLEETER_MODEL}.tar.gz.sha256"
MODEL_URL="https://github.com/deezer/spleeter/releases/download/v1.4.0/${SPLEETER_MODEL}.tar.gz"

ok "SPLEETER_MODEL = ${SPLEETER_MODEL}"

needs_download=false
needs_extract=false

# Verify cached tarball
if [ -f "${TARBALL}" ] && [ -f "${TARBALL_SHA}" ]; then
  expected=$(cat "${TARBALL_SHA}")
  actual=$(sha256sum "${TARBALL}" | awk '{print $1}')
  if [ "${expected}" = "${actual}" ]; then
    ok "${SPLEETER_MODEL} tarball checksum OK — ${TARBALL}"
  else
    warn "${SPLEETER_MODEL} tarball checksum mismatch (expected ${expected}, got ${actual}) — re-downloading"
    needs_download=true
  fi
else
  needs_download=true
fi

# Download tarball if missing or corrupt
if [ "${needs_download}" = true ]; then
  info "Fetching ${MODEL_URL} ..."
  mkdir -p "${CACHE_DIR}"
  if curl -fsSL -o "${TARBALL}" "${MODEL_URL}"; then
    sha256sum "${TARBALL}" | awk '{print $1}' > "${TARBALL_SHA}"
    ok "${SPLEETER_MODEL} tarball downloaded — $(cat "${TARBALL_SHA}")"
    needs_extract=true
  else
    rm -f "${TARBALL}" "${TARBALL_SHA}"
    fail "Failed to download ${SPLEETER_MODEL} model from ${MODEL_URL}"
  fi
fi

# Check model files; extract if missing or tarball was just (re-)downloaded
if ls "${MODEL_DIR}"/*.meta > /dev/null 2>&1; then
  ok "${SPLEETER_MODEL} model files present — ${MODEL_DIR}"
else
  needs_extract=true
fi

if [ "${needs_extract}" = true ]; then
  info "Extracting ${TARBALL} → ${MODEL_DIR} ..."
  mkdir -p "${MODEL_DIR}"
  if tar -xz -C "${MODEL_DIR}" -f "${TARBALL}"; then
    if ls "${MODEL_DIR}"/*.meta > /dev/null 2>&1; then
      ok "${SPLEETER_MODEL} model extracted successfully"
    else
      fail "Extraction succeeded but no .meta files found at ${MODEL_DIR}"
    fi
  else
    fail "Failed to extract ${TARBALL}"
  fi
fi

# Copy model config JSON into MODEL_DIR so spleeter can be invoked with -p {MODEL_DIR}/{model}.json
# Both 2stems and 2stems-finetune use the same architecture config (2stems.json).
SPLEETER_RESOURCES=$(python3 -c "import spleeter, os; print(os.path.join(os.path.dirname(spleeter.__file__), 'resources'))" 2>/dev/null) || true
if [ -z "${SPLEETER_RESOURCES}" ] || [ ! -d "${SPLEETER_RESOURCES}" ]; then
  fail "could not locate spleeter resources dir — is spleeter installed?"
fi
if [ ! -f "${SPLEETER_RESOURCES}/2stems.json" ]; then
  fail "2stems.json not found in ${SPLEETER_RESOURCES}"
fi
cp "${SPLEETER_RESOURCES}/2stems.json" "${MODEL_DIR}/${SPLEETER_MODEL}.json"
ok "copied 2stems.json → ${MODEL_DIR}/${SPLEETER_MODEL}.json"

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
hdr "Environment"

ok "NODE_ENV       = ${NODE_ENV:-<unset>}"
ok "KES_PATH_DATA  = ${KES_PATH_DATA:-<unset>}"
ok "KES_PORT       = ${KES_PORT:-<unset>}"
ok "SPLEETER_DATA  = ${SPLEETER_DATA}"
ok "SPLEETER_MODEL = ${SPLEETER_MODEL}"

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
