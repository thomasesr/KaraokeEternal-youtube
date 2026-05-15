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

# ---------------------------------------------------------------------------
# --install subcommand
# ---------------------------------------------------------------------------
INSTALL_MODE=false
INSTALL_GPU=false
for _arg in "$@"; do
  case "$_arg" in
    --install)     INSTALL_MODE=true ;;
    --install-gpu) INSTALL_MODE=true; INSTALL_GPU=true ;;
  esac
done

install_deps() {
  hdr "=== KaraokeEternal installer ==="

  # ---- System packages (apt) -----------------------------------------------
  hdr "System packages (apt)"
  if [ "$(id -u)" != "0" ]; then
    warn "Not root — skipping apt. Re-run with sudo to install system packages."
  else
    apt-get update
    apt-get install -y --no-install-recommends \
      python3 python3-pip ffmpeg ca-certificates zip unzip curl git build-essential
    rm -rf /var/lib/apt/lists/*
    ok "apt packages installed"
  fi

  # ---- nvm + Node 24 --------------------------------------------------------
  hdr "Node.js (nvm)"
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    info "Installing nvm..."
    # Temporarily relax errexit so nvm installer can set up shell hooks
    set +e
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    set -e
    ok "nvm installed → $NVM_DIR"
  else
    ok "nvm already present → $NVM_DIR"
  fi
  # shellcheck source=/dev/null
  \. "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm use 24
  nvm alias default 24
  ok "Node $(node --version) / npm $(npm --version)"

  # ---- Deno -----------------------------------------------------------------
  hdr "Deno"
  DENO_VERSION="${DENO_VERSION:-2.3.3}"
  if command -v deno > /dev/null 2>&1; then
    ok "deno already present — $(deno --version | head -1)"
  else
    ARCH=$(uname -m)
    if [ "$ARCH" = "aarch64" ]; then DARCH="aarch64-unknown-linux-gnu"
    else DARCH="x86_64-unknown-linux-gnu"; fi
    curl -fsSL \
      "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${DARCH}.zip" \
      -o /tmp/deno.zip
    unzip /tmp/deno.zip -d /usr/local/bin/
    chmod +x /usr/local/bin/deno
    rm /tmp/deno.zip
    ok "deno $(deno --version | head -1)"
  fi

  # ---- Python packages (pip3) -----------------------------------------------
  hdr "Python packages (pip3)"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  # --install-gpu flag overrides CTC_USE_GPU env var
  if [ "$INSTALL_GPU" = true ]; then GPU=1
  else GPU="${CTC_USE_GPU:-0}"; fi
  if [ "$GPU" = "1" ]; then
    REQ_FILE="${SCRIPT_DIR}/requirements.txt"
    info "CTC_USE_GPU=1 → GPU (CUDA) requirements"
  else
    REQ_FILE="${SCRIPT_DIR}/requirements-cpu.txt"
    info "CTC_USE_GPU=0 → CPU requirements"
  fi

  if [ ! -f "$REQ_FILE" ]; then
    fail "Requirements file not found: $REQ_FILE"
  fi

  # Step 1: yt-dlp + spleeter (TF resolved by spleeter-thomasesr)
  info "Installing yt-dlp + spleeter..."
  pip3 install --no-cache-dir --break-system-packages \
    --timeout 300 --retries 5 \
    yt-dlp "spleeter-thomasesr==3.0.0a1"
  ok "yt-dlp + spleeter installed"

  # Step 2: ctc-forced-aligner (onnxruntime-based; no torch dependency)
  info "Installing ctc-forced-aligner..."
  pip3 install --no-cache-dir --break-system-packages \
    --timeout 300 --retries 5 \
    ctc-forced-aligner unidecode
  ok "ctc-forced-aligner installed"
}

if [ "$INSTALL_MODE" = true ]; then
  install_deps
  hdr "Done"
  ok "Installation complete. Run './init.sh' to start KaraokeEternal."
  exit 0
fi

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
  ver=$(pip3 show spleeter-thomasesr 2>/dev/null | awk '/^Version:/ {print $2}')
  ok "spleeter (python module) — ${ver:-installed}"
else
  fail "spleeter — Python module not found (pip3 install spleeter-thomasesr)"
fi

# ---------------------------------------------------------------------------
# ctc-forced-aligner (optional — required only when enhancedLrcBackend=ctc)
# ---------------------------------------------------------------------------
hdr "Enhanced LRC (ctc-forced-aligner)"

export CTC_MODEL_PATH="${CTC_MODEL_PATH:-${KES_PATH_DATA:-/data}/ctc}"
CTC_MODEL_FILE="${CTC_MODEL_PATH}/model.onnx"
CTC_MODEL_URL="https://huggingface.co/deskpai/ctc_forced_aligner/resolve/main/04ac86b67129634da93aea76e0147ef3.onnx"

if python3 -c "import ctc_forced_aligner" 2>/dev/null; then
  ctc_ver=$(pip3 show ctc-forced-aligner 2>/dev/null | awk '/^Version:/ {print $2}')
  ok "ctc-forced-aligner (python module) — ${ctc_ver:-installed}"

  # Check onnxruntime (required by ctc-forced-aligner v1.x)
  if python3 -c "import onnxruntime" 2>/dev/null; then
    ort_ver=$(python3 -c "import onnxruntime; print(onnxruntime.__version__)" 2>/dev/null)
    ok "onnxruntime — ${ort_ver:-installed}"
  else
    warn "onnxruntime not found — ctc-forced-aligner will fail at runtime (pip3 install onnxruntime)"
  fi

  # Download ONNX alignment model if not present
  ok "CTC_MODEL_PATH = ${CTC_MODEL_PATH}"
  if [ -f "${CTC_MODEL_FILE}" ]; then
    ok "ONNX alignment model present — ${CTC_MODEL_FILE}"
  else
    info "Fetching ONNX alignment model → ${CTC_MODEL_FILE} ..."
    mkdir -p "${CTC_MODEL_PATH}"
    if curl -fsSL -o "${CTC_MODEL_FILE}" "${CTC_MODEL_URL}"; then
      ok "ONNX alignment model downloaded — ${CTC_MODEL_FILE}"
    else
      rm -f "${CTC_MODEL_FILE}"
      warn "Failed to download ONNX alignment model — Enhanced LRC will fail at runtime"
    fi
  fi
else
  warn "ctc-forced-aligner not found — Enhanced LRC feature will be unavailable"
  warn "  Install: pip3 install ctc-forced-aligner"
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
# Write config JSON with model_dir set to absolute MODEL_DIR path.
# The stock 2stems.json uses a relative path which causes PermissionError when spleeter
# is invoked with -p /absolute/path.json (spleeter only overrides model_dir when using
# the spleeter: prefix, not when given a file path).
python3 - <<PYEOF
import json
with open("${SPLEETER_RESOURCES}/2stems.json") as f:
    cfg = json.load(f)
cfg["model_dir"] = "${MODEL_DIR}"
with open("${MODEL_DIR}/${SPLEETER_MODEL}.json", "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF
ok "wrote ${SPLEETER_MODEL}.json (model_dir=${MODEL_DIR}) → ${MODEL_DIR}/${SPLEETER_MODEL}.json"

# ---------------------------------------------------------------------------
# Environment variables
# ---------------------------------------------------------------------------
hdr "Environment"

ok "NODE_ENV       = ${NODE_ENV:-<unset>}"
ok "KES_PATH_DATA  = ${KES_PATH_DATA:-<unset>}"
ok "KES_PORT       = ${KES_PORT:-<unset>}"
ok "SPLEETER_DATA  = ${SPLEETER_DATA}"
ok "SPLEETER_MODEL = ${SPLEETER_MODEL}"
ok "CTC_MODEL_PATH = ${CTC_MODEL_PATH}"
ok "CTC_USE_GPU    = ${CTC_USE_GPU:-0} (0=cpu, 1=cuda)"

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
