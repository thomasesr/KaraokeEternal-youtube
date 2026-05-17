# syntax=docker/dockerfile:1.6

# ---- builder ----
# Node 24 on Alpine for npm ci + build (node-gyp only needs any python3)
FROM node:24-alpine AS builder

ARG REPO_SLUG=thomasesr/KaraokeEternal-youtube
ARG REPO_BRANCH=merge

RUN apk add --no-cache git python3 make g++ pkgconfig

WORKDIR /src

ADD https://api.github.com/repos/${REPO_SLUG}/commits/${REPO_BRANCH} /tmp/branch-head.json
RUN git clone --depth=1 --branch "${REPO_BRANCH}" "https://github.com/${REPO_SLUG}.git" .

RUN npm ci
RUN npm run build

# ---- prod-deps ----
# Fresh npm ci --omit=dev is faster than npm prune on large trees
FROM node:24-alpine AS installer
RUN apk add --no-cache python3 make g++ pkgconfig
WORKDIR /prod-deps
COPY --from=builder /src/package.json /src/package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
# Debian Bookworm slim: python3 = 3.11 (spleeter requires <=3.11; Alpine 3.20+ ships 3.12 which breaks norbert)
FROM node:24-bookworm-slim

# zip: used by SpleeterDownloader to package mp3+lrc
# unzip: needed to extract deno binary
# ffmpeg: video/audio remux + wav→mp3 conversion
# ca-certificates: TLS roots for fetch
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip ffmpeg ca-certificates zip unzip curl

COPY --from=builder --chown=node:node /src/requirements-cpu.txt ./requirements-cpu.txt
COPY --from=builder --chown=node:node /src/init.sh ./init.sh
RUN bash ./init.sh --install  && rm -rf /var/lib/apt/lists/*

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
COPY --from=installer --chown=node:node /prod-deps/node_modules ./node_modules
COPY --from=builder --chown=node:node /src/package.json ./package.json
COPY --from=builder --chown=node:node /src/init.sh ./init.sh
COPY --from=builder --chown=node:node /src/requirements-cpu.txt ./requirements-cpu.txt
RUN chmod +x /app/init.sh

RUN mkdir -p /data && chown node:node /data

VOLUME ["/data"]

EXPOSE 3000

USER node

ENTRYPOINT ["/app/init.sh"]
