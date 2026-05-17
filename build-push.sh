#!/usr/bin/env bash
# Build and optionally push Docker images to Docker Hub.
# Usage:
#   ./build-push.sh              # prompt-per-image build of CPU :latest images
#   ./build-push.sh --cuda       # prompt-per-image build of GPU :cuda images
#   ./build-push.sh --push       # push built images to Docker Hub
#
# Requires: docker buildx, docker login (thomasesr) when using --push

set -euo pipefail

REPO="https://github.com/thomasesr/KaraokeEternal-youtube.git"
BRANCH="Compose"
DOCKER_USER="thomasesr"

BUILD_CUDA=false
DO_PUSH=false

for arg in "$@"; do
  case "$arg" in
    --cuda) BUILD_CUDA=true ;;
    --push) DO_PUSH=true ;;
  esac
done

# ── clone ─────────────────────────────────────────────────────────────────────
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

echo "==> Cloning $REPO branch $BRANCH"
git clone --depth=1 --branch "$BRANCH" "$REPO" "$WORKDIR"
cd "$WORKDIR"

# ── helper ────────────────────────────────────────────────────────────────────
build_and_push() {
  local image="$1"
  local context="$2"
  local dockerfile="$3"

  echo ""
  printf "Build %s? [y/N] " "$image"
  read -r answer </dev/tty
  case "$answer" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "  Skipping $image"; return ;;
  esac

  echo "==> Building $image"
  docker buildx build \
    --platform linux/amd64 \
    --file "$dockerfile" \
    --tag "$image" \
    $( $DO_PUSH && echo "--push" || echo "--load" ) \
    "$context"

  $DO_PUSH && echo "  Pushed $image" || echo "  Loaded $image (local only)"
}

# ── images ────────────────────────────────────────────────────────────────────
if $BUILD_CUDA; then
  echo ""
  echo "==> CUDA images (:cuda)"
  build_and_push "${DOCKER_USER}/karaoke:cuda"   "."                 "Dockerfile-cuda"
  build_and_push "${DOCKER_USER}/spleeter:cuda"  "services/spleeter" "services/spleeter/Dockerfile.cuda"
  build_and_push "${DOCKER_USER}/ctc:cuda"       "services/ctc"      "services/ctc/Dockerfile.cuda"
  build_and_push "${DOCKER_USER}/whisperx:cuda"  "services/whisperx" "services/whisperx/Dockerfile.cuda"
else
  echo ""
  echo "==> CPU images (:latest)"
  build_and_push "${DOCKER_USER}/karaoke:latest"   "."                 "Dockerfile"
  build_and_push "${DOCKER_USER}/spleeter:latest"  "services/spleeter" "services/spleeter/Dockerfile"
  build_and_push "${DOCKER_USER}/ctc:latest"       "services/ctc"      "services/ctc/Dockerfile"
  build_and_push "${DOCKER_USER}/whisperx:latest"  "services/whisperx" "services/whisperx/Dockerfile"
fi

echo ""
echo "==> Done."
