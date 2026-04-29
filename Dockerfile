# Enable BuildKit features (e.g. ADD from URL with checksum, --link mounts)
# syntax=docker/dockerfile:1.6

# ---- builder ----
# Base image: Node 24 on Alpine (matches package.json engines: ">=24")
FROM node:24-alpine AS builder

# Build-time arg: git remote to clone (override with --build-arg REPO_URL=...)
ARG REPO_URL=https://github.com/thomasesr/KaraokeEternal-youtube.git
# Build-time arg: branch to clone (override with --build-arg REPO_BRANCH=...)
ARG REPO_BRANCH=youtube

# Install: git (clone), python3+make+g++ (node-gyp for native modules e.g. better-sqlite3), pkgconfig (autotools deps)
RUN apk add --no-cache git python3 make g++ pkgconfig

# Working dir for the clone + build
WORKDIR /src

# Cache-bust: this URL's response changes whenever the branch HEAD moves,
# invalidating the layer below so docker re-clones on new commits.
ADD https://api.github.com/repos/thomasesr/KaraokeEternal-youtube/commits/${REPO_BRANCH} /tmp/branch-head.json
# Shallow clone the requested branch into the current workdir
RUN git clone --depth=1 --branch "${REPO_BRANCH}" "${REPO_URL}" .

# Install all dependencies (including dev) deterministically from package-lock.json
RUN npm ci
# Run the project's build (npm run build:server + build:client → /src/build)
RUN npm run build
# Drop devDependencies from node_modules so they don't bloat the runtime image
RUN npm prune --omit=dev

# ---- runtime ----
# Fresh minimal Node 24 Alpine image (no build toolchain)
FROM node:24-alpine

# python3+py3-pip: required by yt-dlp; ffmpeg: required for merge/remux of separate video+audio streams;
# ca-certificates: TLS roots for HTTPS fetch.
# Then install latest stable yt-dlp from PyPI (--break-system-packages bypasses PEP 668 on Alpine).
RUN apk add --no-cache python3 py3-pip ffmpeg ca-certificates \
  && pip install --no-cache-dir --break-system-packages -U yt-dlp \
  && yt-dlp --version

# NODE_ENV=production: dev hints off; KES_PATH_DATA=/data: SQLite + uploads land in volume; KES_PORT=3000: fixed listening port
ENV NODE_ENV=production \
    KES_PATH_DATA=/data \
    KES_PORT=3000

# Working dir for the running app
WORKDIR /app

# Copy compiled output (server JS + client bundle) from the builder
COPY --from=builder /src/build ./build
# Copy static assets the server serves alongside the client
COPY --from=builder /src/assets ./assets
# Copy pruned production node_modules
COPY --from=builder /src/node_modules ./node_modules
# Copy package.json so node can resolve "main" + "type" fields
COPY --from=builder /src/package.json ./package.json

# Declare /data as a volume so SQLite db survives container removal (mount with -v <host>:/data)
VOLUME ["/data"]

# Document the listening port (does not publish; use -p 3000:3000 at run-time)
EXPOSE 3000

# Run node directly as PID 1 (exec form, no shell wrapper).
# For zombie reaping in long-running containers spawning yt-dlp/ffmpeg children,
# pass `docker run --init` (or `init: true` in compose) so dockerd injects its
# own init shim. Avoids the tini-not-PID-1 issue some runtimes exhibit.
ENTRYPOINT ["node", "build/server/main.js"]
