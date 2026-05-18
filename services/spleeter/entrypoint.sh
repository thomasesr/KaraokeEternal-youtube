#!/bin/bash
set -euo pipefail

MODEL="${SPLEETER_MODEL:-2stems}"
DATA="${SPLEETER_DATA:-/data/spleeter}"
MODEL_DIR="${DATA}/pretrained_models/${MODEL}"
CACHE_DIR="${SPLEETER_CACHE:-/tmp/spleeter-cache}"
TARBALL="${CACHE_DIR}/${MODEL}.tar.gz"
TARBALL_SHA="${CACHE_DIR}/${MODEL}.tar.gz.sha256"
MODEL_URL="https://github.com/deezer/spleeter/releases/download/v1.4.0/${MODEL}.tar.gz"

mkdir -p "${MODEL_DIR}" "${CACHE_DIR}"

# Verify cached tarball checksum
needs_download=false
if [ -f "${TARBALL}" ] && [ -f "${TARBALL_SHA}" ]; then
  expected=$(cat "${TARBALL_SHA}")
  actual=$(sha256sum "${TARBALL}" | awk '{print $1}')
  if [ "${expected}" != "${actual}" ]; then
    echo "[spleeter] tarball checksum mismatch — re-downloading"
    needs_download=true
  fi
else
  needs_download=true
fi

if [ "${needs_download}" = true ]; then
  echo "[spleeter] Downloading model: ${MODEL_URL}"
  curl -fsSL -o "${TARBALL}" "${MODEL_URL}"
  sha256sum "${TARBALL}" | awk '{print $1}' > "${TARBALL_SHA}"
fi

# Extract if model files missing; deezer tarballs contain a top-level subdir
# named after the model — flatten it into MODEL_DIR
if ! ls "${MODEL_DIR}"/*.meta > /dev/null 2>&1; then
  echo "[spleeter] Extracting ${TARBALL} → ${MODEL_DIR}"
  TMP_EXTRACT=$(mktemp -d)
  tar -xz -C "${TMP_EXTRACT}" -f "${TARBALL}"
  # Flatten single subdir if present; otherwise files are already at root
  SUBDIR=$(ls "${TMP_EXTRACT}" | head -1)
  if [ -d "${TMP_EXTRACT}/${SUBDIR}" ] && [ "$(ls "${TMP_EXTRACT}" | wc -l)" -eq 1 ]; then
    mv "${TMP_EXTRACT}/${SUBDIR}"/* "${MODEL_DIR}/"
  else
    mv "${TMP_EXTRACT}"/* "${MODEL_DIR}/"
  fi
  rm -rf "${TMP_EXTRACT}"
fi

# Write config JSON with absolute model_dir.
# Try ${MODEL}.json first (e.g. 2stems-finetune.json); fall back to base model
# (strip -finetune suffix) since finetune shares the same architecture.
SPLEETER_RESOURCES=$(python3 -c "import spleeter, os; print(os.path.join(os.path.dirname(spleeter.__file__), 'resources'))")
BASE_MODEL="${MODEL%%-finetune}"
python3 - <<PYEOF
import json, os

resources = "${SPLEETER_RESOURCES}"
model = "${MODEL}"
base = "${BASE_MODEL}"

cfg_path = os.path.join(resources, f"{model}.json")
if not os.path.exists(cfg_path):
    cfg_path = os.path.join(resources, f"{base}.json")

with open(cfg_path) as f:
    cfg = json.load(f)

cfg["model_dir"] = "${MODEL_DIR}"

with open("${MODEL_DIR}/${MODEL}.json", "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF

echo "[spleeter] Model ready (${MODEL}). Starting HTTP service on :5000"
exec uvicorn app:app --host 0.0.0.0 --port 5000
