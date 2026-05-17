#!/usr/bin/env bash
# Build and optionally push Docker images to Docker Hub.
# Uses docker buildx native GitHub URL support — no local clone required.
#
# Usage:
#   ./build-push.sh              # prompt-per-image build of CPU :latest images
#   ./build-push.sh --cuda       # prompt-per-image build of GPU :cuda images
#   ./build-push.sh --push       # push built images to Docker Hub
#
# Note: whisperx:latest and whisperx:cuda are the same image.
#       GPU is activated at runtime via WHISPER_USE_GPU=1 in compose.
#
# Requires: docker buildx, docker login (thomasesr) when using --push

set -euo pipefail

REPO="https://github.com/thomasesr/KaraokeEternal-youtube.git"
BRANCH="Compose"
DOCKER_USER="thomasesr"
BASE="${REPO}#${BRANCH}"   # docker buildx GitHub URL base

BUILD_CUDA=false
DO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --cuda) BUILD_CUDA=true ;;
    --push) DO_PUSH=true ;;
  esac
done

# ── helpers ───────────────────────────────────────────────────────────────────
_build() {
  local context="$1"; shift   # e.g. ${BASE}:services/spleeter
  local file="$1";    shift   # e.g. Dockerfile.cuda  (relative to context)
  local tags=("$@")           # one or more --tag values

  local tag_args=()
  for t in "${tags[@]}"; do tag_args+=(--tag "$t"); done

  docker buildx build \
    --platform linux/amd64 \
    --file "$file" \
    "${tag_args[@]}" \
    $( $DO_PUSH && echo "--push" || echo "--load" ) \
    "$context"
}

build_image() {
  local label="$1"; shift   # display name shown in prompt
  local context="$1"; shift
  local file="$1"; shift
  local tags=("$@")

  echo ""
  printf "Build %s? [y/N] " "$label"
  read -r answer </dev/tty
  [[ "$answer" =~ ^[yY] ]] || { echo "  Skipping $label"; return; }

  echo "==> Building $label"
  _build "$context" "$file" "${tags[@]}"
  $DO_PUSH && echo "  Pushed $label" || echo "  Loaded $label (local only)"
}

# ── images ────────────────────────────────────────────────────────────────────
if $BUILD_CUDA; then
  echo ""
  echo "==> CUDA images (:cuda)"
  build_image "karaoke:cuda" \
    "${BASE}" "Dockerfile-cuda" \
    "${DOCKER_USER}/karaoke:cuda"

  build_image "spleeter:cuda" \
    "${BASE}:services/spleeter" "Dockerfile.cuda" \
    "${DOCKER_USER}/spleeter:cuda"

  build_image "ctc:cuda" \
    "${BASE}:services/ctc" "Dockerfile.cuda" \
    "${DOCKER_USER}/ctc:cuda"

  # whisperx: same image for :latest and :cuda — tagged both in one build
  build_image "whisperx:latest + whisperx:cuda" \
    "${BASE}:services/whisperx" "Dockerfile" \
    "${DOCKER_USER}/whisperx:latest" "${DOCKER_USER}/whisperx:cuda"

else
  echo ""
  echo "==> CPU images (:latest)"
  build_image "karaoke:latest" \
    "${BASE}" "Dockerfile" \
    "${DOCKER_USER}/karaoke:latest"

  build_image "spleeter:latest" \
    "${BASE}:services/spleeter" "Dockerfile" \
    "${DOCKER_USER}/spleeter:latest"

  build_image "ctc:latest" \
    "${BASE}:services/ctc" "Dockerfile" \
    "${DOCKER_USER}/ctc:latest"

  build_image "whisperx:latest + whisperx:cuda" \
    "${BASE}:services/whisperx" "Dockerfile" \
    "${DOCKER_USER}/whisperx:latest" "${DOCKER_USER}/whisperx:cuda"
fi

echo ""
echo "==> Done."
