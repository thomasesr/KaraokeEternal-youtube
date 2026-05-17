# syntax=docker/dockerfile:1.6

# ---- builder ----
# Node 24 on Alpine for npm ci + build (node-gyp only needs any python3)
FROM node:24-alpine AS builder

ARG REPO_SLUG=thomasesr/KaraokeEternal-youtube
ARG REPO_BRANCH=Compose

RUN apk add --no-cache git python3 make g++ pkgconfig

WORKDIR /src

ADD https://api.github.com/repos/${REPO_SLUG}/commits/${REPO_BRANCH} /tmp/branch-head.json
RUN git clone --depth=1 --branch "${REPO_BRANCH}" "https://github.com/${REPO_SLUG}.git" .

RUN npm ci
RUN npm run build

# ---- prod-deps ----
FROM node:24-alpine AS installer
RUN apk add --no-cache python3 make g++ pkgconfig
WORKDIR /prod-deps
COPY --from=builder /src/package.json /src/package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime ----
# Main app container — no ML Python deps (spleeter/ctc/whisperx run as separate services)
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates zip unzip curl && \
    curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod +x /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    KES_PATH_DATA=/data \
    KES_PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /src/build ./build
COPY --from=builder --chown=node:node /src/assets ./assets
COPY --from=installer --chown=node:node /prod-deps/node_modules ./node_modules
COPY --from=builder --chown=node:node /src/package.json ./package.json
COPY --from=builder --chown=node:node /src/init.sh ./init.sh
RUN chmod +x /app/init.sh

RUN mkdir -p /data && chown node:node /data

VOLUME ["/data"]

EXPOSE 3000

USER node

ENTRYPOINT ["/app/init.sh"]
