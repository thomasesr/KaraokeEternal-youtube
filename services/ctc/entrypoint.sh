#!/bin/bash
set -euo pipefail

CTC_MODEL_PATH="${CTC_MODEL_PATH:-/data/ctc}"
CTC_MODEL_FILE="${CTC_MODEL_PATH}/model.onnx"
CTC_MODEL_URL="https://huggingface.co/deskpai/ctc_forced_aligner/resolve/main/04ac86b67129634da93aea76e0147ef3.onnx"

mkdir -p "${CTC_MODEL_PATH}"

if [ ! -f "${CTC_MODEL_FILE}" ]; then
  echo "[ctc] Downloading ONNX alignment model → ${CTC_MODEL_FILE}"
  curl -fsSL -o "${CTC_MODEL_FILE}" "${CTC_MODEL_URL}"
fi

echo "[ctc] Model ready. Starting HTTP service on :5001"
exec uvicorn app:app --host 0.0.0.0 --port 5001
