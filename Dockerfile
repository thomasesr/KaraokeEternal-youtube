# syntax=docker/dockerfile:1.6

# ---- builder ----
# Node 24 on Alpine for npm ci + build (node-gyp only needs any python3)
FROM node:24-alpine AS builder

ARG REPO_SLUG=thomasesr/KaraokeEternal-youtube
ARG REPO_BRANCH=youtube

RUN apk add --no-cache git python3 make g++ pkgconfig

WORKDIR /src

ADD https://api.github.com/repos/${REPO_SLUG}/commits/${REPO_BRANCH} /tmp/branch-head.json
RUN git clone --depth=1 --branch "${REPO_BRANCH}" "https://github.com/${REPO_SLUG}.git" .

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

# ---- runtime ----
# Debian Bookworm slim: python3 = 3.11 (spleeter requires <=3.11; Alpine 3.20+ ships 3.12 which breaks norbert)
FROM node:24-bookworm-slim

# zip: used by SpleeterDownloader to package mp3+lrc
# unzip: needed to extract deno binary
# ffmpeg: video/audio remux + wav→mp3 conversion
# ca-certificates: TLS roots for fetch
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg ca-certificates zip unzip curl \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp and spleeter (TF 2.x CPU) via pip
# --break-system-packages: bypass PEP 668 restriction in Debian-managed Python
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp spleeter \
  && yt-dlp --version \
  && python3 -c "import spleeter; print('spleeter ok')"

# Install deno for yt-dlp EJS challenge solver (signature/n-param decryption).
# Handles amd64 and arm64 builds.
ARG DENO_VERSION=2.3.3
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then DARCH="aarch64-unknown-linux-gnu"; \
    else DARCH="x86_64-unknown-linux-gnu"; fi && \
    curl -fsSL "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${DARCH}.zip" \
      -o /tmp/deno.zip \
  && unzip /tmp/deno.zip -d /usr/local/bin/ \
  && chmod +x /usr/local/bin/deno \
  && rm /tmp/deno.zip \
  && deno --version

# Spleeter downloads the 2-stems model on first use into SPLEETER_DATA.
# Pointing it at /data/spleeter keeps the model in the existing data volume
# so it survives container replacement without re-downloading.
ENV NODE_ENV=production \
    KES_PATH_DATA=/data \
    KES_PORT=3000 \
    SPLEETER_DATA=/data/spleeter

WORKDIR /app

COPY --from=builder --chown=node:node /src/build ./build
COPY --from=builder --chown=node:node /src/assets ./assets
COPY --from=builder --chown=node:node /src/node_modules ./node_modules
COPY --from=builder --chown=node:node /src/package.json ./package.json
COPY --chown=node:node init.sh ./init.sh
RUN chmod +x /app/init.sh

RUN mkdir -p /data && chown node:node /data

VOLUME ["/data"]

EXPOSE 3000

USER node

ENTRYPOINT ["/app/init.sh"]
