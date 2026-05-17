#!/bin/bash
set -euo pipefail
MODEL="${WHISPER_MODEL:-small}"
CACHE="${WHISPER_MODEL_CACHE:-/data/whisper}"
echo "[whisperx] model=${MODEL} device=${WHISPER_USE_GPU:-0} cache=${CACHE}"
echo "[whisperx] Starting HTTP service on :5002"
exec uvicorn app:app --host 0.0.0.0 --port 5002
