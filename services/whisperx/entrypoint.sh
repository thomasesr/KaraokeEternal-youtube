#!/bin/bash
set -euo pipefail
# wav2vec2 alignment models are downloaded on first use per language
echo "[whisperx] Starting HTTP service on :5002"
exec uvicorn app:app --host 0.0.0.0 --port 5002
