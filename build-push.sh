#!/usr/bin/env bash
# Build and push all Docker images to Docker Hub.
# Usage:
#   ./build-push.sh              # build+push latest (CPU) tags only
#   ./build-push.sh --cuda       # build+push both latest and cuda tags
#   ./build-push.sh --no-push    # build only, skip docker push
#
# Requires: docker buildx, docker login (thomasesr)

set -euo pipefail

REPO="https://github.com/thomasesr/KaraokeEternal-youtube.git"
BRANCH="Compose"
DOCKER_USER="thomasesr"

BUILD_CUDA=false
DO_PUSH=true

for arg in "$@"; do
  case "$arg" in
    --cuda)    BUILD_CUDA=true ;;
    --no-push) DO_PUSH=false ;;
  esac
done

# ── clone / update ────────────────────────────────────────────────────────────
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Cloning $REPO branch $BRANCH into $WORKDIR"
git clone --depth=1 --branch "$BRANCH" "$REPO" "$WORKDIR"

cd "$WORKDIR"

# ── helper ────────────────────────────────────────────────────────────────────
build_and_push() {
  local image="$1"   # e.g. thomasesr/karaoke:latest
  local context="$2" # e.g. .
  local dockerfile="$3"

  echo ""
  echo "==> Building $image"
  docker buildx build \
    --platform linux/amd64 \
    --file "$dockerfile" \
    --tag "$image" \
    $( $DO_PUSH && echo "--push" || echo "--load" ) \
    "$context"
}

# ── CPU images ────────────────────────────────────────────────────────────────
build_and_push "${DOCKER_USER}/karaoke:latest"   "."                  "Dockerfile"
build_and_push "${DOCKER_USER}/spleeter:latest"  "services/spleeter"  "services/spleeter/Dockerfile"
build_and_push "${DOCKER_USER}/ctc:latest"       "services/ctc"       "services/ctc/Dockerfile"
build_and_push "${DOCKER_USER}/whisperx:latest"  "services/whisperx"  "services/whisperx/Dockerfile"

# ── CUDA images (opt-in) ──────────────────────────────────────────────────────
if $BUILD_CUDA; then
  build_and_push "${DOCKER_USER}/karaoke:cuda"   "."                  "Dockerfile-cuda"
  build_and_push "${DOCKER_USER}/spleeter:cuda"  "services/spleeter"  "services/spleeter/Dockerfile.cuda"
  build_and_push "${DOCKER_USER}/ctc:cuda"       "services/ctc"       "services/ctc/Dockerfile.cuda"
  build_and_push "${DOCKER_USER}/whisperx:cuda"  "services/whisperx"  "services/whisperx/Dockerfile.cuda"
fi

echo ""
echo "==> Done."
$DO_PUSH && echo "    Images pushed to Docker Hub." || echo "    --no-push: images loaded locally only."
