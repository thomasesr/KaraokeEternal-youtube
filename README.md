# Karaoke Eternal

Host awesome karaoke parties where everyone can easily find and queue songs from their phone's browser. The player is also fully browser-based with support for MP3+G, MP4 videos and WebGL visualizations. The server is self-hosted and runs on nearly everything.

[![Karaoke Eternal](/docs/assets/images/README.jpg?raw=true)](/docs/assets/images/README.jpg?raw=true)

<p align="center">
  <i>App in mobile browser (top) controlling player in desktop browser (bottom)</i>
</p>

## Features

- Plays:
  - MP3+G (MP3 with CDG lyrics; including zipped)
  - MP4 videos
  - Music-synced visualizations (with automatic lyrics background removal)
- Fast, modern mobile browser app designed for "karaoke conditions"
- Easy joining with QR codes and guest accounts
- Multiple simultaneous rooms/queues (optionally password-protected)
- Dynamic queues keep parties fair, fun and no-fuss
- Fully self-hosted
- No ads or telemetry
- **YouTube integration** (this fork): search YouTube directly from the
  library, auto-tag tracks via MusicBrainz, and queue them into the
  current room without a folder rescan.
- **Audio-only import** (this fork): drop plain MP3/FLAC/WAV/OGG/OPUS/AAC
  files into a designated folder; the scanner strips vocals with Spleeter,
  fetches synced lyrics from lrclib.net, and converts them into karaoke-ready
  MP3+LRC archives automatically.
- **Room manager role** (this fork): delegate per-room queue control and
  media version preferences to a trusted user without granting full admin
  access.
- **PWA / installable app** (this fork): install the app to your home
  screen per room — each room gets its own name, icon, and launch URL so
  singers can open directly into the right room.
- **Push notifications** (this fork): singers receive a browser push
  notification when it's their turn to sing, even if the tab is in the
  background. Works on Android and desktop; iOS requires Safari 16.4+.
- **Color themes** (this fork): choose from four built-in themes (Dark
  Blue, Dark Green, Dark Red, Light) in Account → Preferences. Preference
  is saved per user.
- **Translations / i18n** (this fork): UI strings are fully
  internationalized. English (en_US) and Brazilian Portuguese (pt_BR)
  are included; additional locales can be added under `src/locales/`.
- **Song scoring** (this fork): after each song ends, players vote
  1–5 stars (half-star resolution) from the queue page or a pop-up
  widget on any other page. The median score animates on the player
  screen as popping stars. Admins and room managers configure scoring
  per room (toggle + voting window 5–30 s). A dedicated **High Scores**
  page shows today's top songs (with singer name), today's top singers,
  and all-time top singers.

## YouTube integration

This fork adds an opt-in YouTube workflow so any logged-in user can pull
karaoke tracks straight into their room's queue.

- **Search:** Press <kbd>Enter</kbd> (or tap the YouTube button) in the
  library search bar to query YouTube. Results are biased toward karaoke
  versions; falls back to a plain query when nothing matches.
- **Auto-tagging via MusicBrainz:** On download, the video title is
  cleaned (strips `(Karaoke Version)`, `[Lyrics]`, `(HD)`, `- Topic`,
  etc.) and looked up against MusicBrainz. If the top match meets the
  admin-configured minimum score, it's used silently; otherwise the user
  is prompted to confirm artist + song title (a second MusicBrainz pass
  canonicalizes their input).
- **Smart filenames:** Files land in your configured download folder as
  `Artist - Title.mp4`, sanitized for cross-platform filesystems.
  Duplicates auto-suffix as ` - yt1`, ` - yt2`, …
- **Direct ingest:** No folder rescan required. The download is inserted
  into the library (`artists` / `songs` / `media` rows) and the requesting
  user's queue, then broadcast to the room over the existing socket.
- **Quality + cookies:** Admin can cap resolution (best / 1080p / 720p /
  480p / 360p) and provide a Netscape `cookies.txt` for age-gated or
  region-locked videos.
- **API key handling:** YouTube Data API v3 key can be set via the admin
  UI or the `KES_YOUTUBE_API_KEY` env var (env wins).
- **Room safety:** If the user's room is deleted mid-download, the
  finished file is removed and the queue insert is skipped.

### Server requirements for downloads

The download path shells out to `yt-dlp`, which in turn relies on a
small toolchain. All of these must be available on the server's `PATH`
(the bundled Dockerfile installs them automatically):

- **`yt-dlp`** — performs the probe + download. Keep current; YouTube
  changes break older releases regularly.
- **`ffmpeg`** — required for merge/remux when video and audio come from
  separate streams (most quality presets).
- **`deno`** (or another supported JS runtime) — required by yt-dlp's
  **EJS** challenge solver, which decrypts YouTube's signature and
  `n`-parameter on every video. Without a JS runtime, yt-dlp returns
  image-only formats and downloads fail with "no video streams".
- **Outbound HTTPS to `github.com`** — yt-dlp is invoked with
  `--remote-components ejs:github`, which fetches the EJS solver bundle
  from `github.com/yt-dlp/ejs` on first use (cached afterward in
  `~/.cache/yt-dlp`). Air-gapped deployments need to allowlist GitHub
  or pre-warm the cache.
- **Fresh `cookies.txt`** (optional but commonly required) — paste the
  Netscape-format export from a logged-in browser into the admin UI and
  enable "Use cookies". Stale cookies trigger YouTube's bot-challenge,
  which the server will surface as a distinct error message.

When a download fails, the server logs the full `yt-dlp` stderr tail
and tags the user-visible error with a category (`EJS solver failed`,
`bot-challenge`, etc.) so operators can act without re-running yt-dlp
manually.

## Audio-only import

This fork can turn a folder of plain audio files into a karaoke library
automatically. Enable it per media folder in **Account → Media Folders →
(folder) → Process audio-only files**.

### How it works

When the scanner finds an audio file (`.mp3`, `.flac`, `.wav`, `.ogg`,
`.opus`, `.aac`) with no `.cdg` or `.lrc` sidecar, and the folder has
**Process audio-only files** enabled, it runs the following pipeline:

1. **Convert to MP3** — Non-MP3 formats are re-encoded to MP3 at 320 kbps
   CBR via `ffmpeg`. Existing MP3s are used as-is.
2. **Resolve artist & title** — Sources tried in order:
   - ID3/Vorbis tags embedded in the file.
   - Filename parsed as `Artist - Title` (leading track numbers like
     `01 - …` are ignored).
   - MusicBrainz recording search using the filename as the query.
   If none of these yield both an artist and a title, the file is skipped
   and left untouched.
3. **Vocal removal via Spleeter** — The MP3 is processed with
   `spleeter separate` (default model: `2stems`). The accompaniment stem
   (`accompaniment.mp3`) is used for the final archive; the vocal stem is
   discarded.
4. **Synced lyrics via lrclib.net** — A timed `.lrc` file is fetched from
   [lrclib.net](https://lrclib.net) using the resolved artist, title, and
   duration. Files with no synced lyrics entry are skipped.
5. **Archive and ingest** — The accompaniment MP3 and the `.lrc` file are
   zipped as `Artist - Title.zip` in the same folder. The original audio
   file is deleted. The archive is indexed into the library on the next
   scan (no manual rescan needed — the archive is registered immediately).

### Server requirements for audio-only import

All of the following must be on the server's `PATH`:

- **`ffmpeg`** — audio conversion and probe. Required for non-MP3 inputs.
- **`spleeter`** — vocal separation. Install via `pip install spleeter`.
  The pretrained model is downloaded automatically on first use to the
  path set by `SPLEETER_DATA` (default: `/data/spleeter`).
- **`zip`** — archive creation.
- **Outbound HTTPS to `lrclib.net`** — synced lyrics lookup.
- **Outbound HTTPS to `musicbrainz.org`** — metadata fallback when tags
  and filename parsing both fail.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SPLEETER_MODEL` | `2stems` | Spleeter model (`2stems`, `4stems`, `5stems`) |
| `SPLEETER_DATA` | `/data/spleeter` | Path where Spleeter stores pretrained models |
| `SPLEETER_USE_GPU` | _(unset)_ | Set to `1` to enable GPU acceleration |

## Room manager role

This fork adds a `room_manager` role that sits between admin and standard
user. Admins assign the role and link managers to specific rooms via
**Account → Rooms**.

### What room managers can do

- **Queue control:** Move or remove *any* song in their room's queue, not
  just their own. Standard users can only move/remove songs they queued.
- **Room-level media version preference:** Choose which file version
  (CDG, MP4, LRC…) plays for a given song across the whole room. Set from
  the song-info panel. Overrides the global admin default; users' personal
  preferences still win over the room default.
- **YouTube search & download:** If the admin has granted
  `room_manager` access under **Account → YouTube**, room managers can
  search YouTube and download tracks directly into their room's queue —
  no admin session required.
- **Re-queue songs:** Re-add a previously played song to the queue.

### Media version resolution order

When multiple file versions exist for a song, the queue picks one using
this priority (highest wins):

1. **User preference** — the singer's own explicit choice
2. **Room preference** — set by the room manager
3. **Global default** — the admin-flagged `isPreferred` file
4. **Path priority** — lowest-priority path, first file (automatic
   fallback)

## Song scoring

After each song finishes playing, every user in the room can rate it
1–5 stars with half-star resolution.

### How it works

- **Voting UI** — the vote widget appears inline on the Queue page for
  the current song, and as a floating pop-up on all other pages.
- **Widget lifetime** — the widget auto-dismisses after
  `5 + votingWindow` seconds. Votes not cast in time are not counted.
- **Singer excluded** — the singer cannot vote on their own song.
- **Result** — after the voting window closes, the server computes the
  median score and broadcasts it to the room. The player animates the
  result as stars popping one by one, then holds the display for 4
  seconds before advancing to the next song.
- **Skipped songs** — receive 0 stars and are not persisted.
- **Unvoted songs** (played to end with 0 votes) — automatically
  receive 5 stars but are excluded from all high-score rankings.

### Room configuration

Admins and room managers configure scoring under **Account → Rooms →
(room) → Song Scoring**:

| Setting | Default | Description |
|---|---|---|
| Enable song scoring | off | Master toggle for the room |
| Voting window | 15 s | Seconds players have to vote (5–30) |

### High Scores page

Accessible from the navigation bar (star icon). Three ranked sections:

| Section | Scope | Ranked by |
|---|---|---|
| Today's Top Songs | Current room, today | Avg score ↓, total votes ↓ (tie-break) |
| Today's Top Singers | Current room, today | Sum of median scores ↓ |
| All-Time Top Singers | All rooms, all time | Sum of median scores ↓ |

Songs and singers with only auto-5-star rows (0 real votes) are
excluded from all rankings.

Microphones are *not* required since the player itself only outputs music - this allows your audio setup to be as simple or complex as you like. See the [F.A.Q.](https://www.karaoke-eternal.com/faq/#recommended-audio-microphone-setup) for more information.

## Getting Started

 Karaoke Eternal basically has 3 parts. See [Getting Started](https://www.karaoke-eternal.com/docs/getting-started/) to get up and running step-by-step, or jump to the documentation for each part below:
 
- **[Server:](https://www.karaoke-eternal.com/docs/karaoke-eternal-server/)** Runs on pretty much anything to serve the web app and your media files, including a Windows PC, Mac, or a dedicated server like a Raspberry Pi or Synology NAS.
- **[App:](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/)** Fast, modern mobile web app designed for "karaoke conditions".
- **[Player:](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/#player)** Just another part of the app, but meant to run fullscreen on the system handling audio/video for a [room](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/#rooms-admin-only)

## Installation

There are several [installation methods](https://www.karaoke-eternal.com/docs/karaoke-eternal-server/#installation) available for Karaoke Eternal Server.

## init.sh

`init.sh` serves two purposes: **dependency installer** (invoked once at setup time) and **startup checker** (the Docker `ENTRYPOINT`).

### Dependency installer

Run once on a fresh host to install all required tools. Detects what is already present and skips it.

```bash
# CPU / bare-metal (installs nvm + Node 24, Deno, yt-dlp, spleeter, ctc-forced-aligner)
./init.sh --install

# GPU / CUDA (same, but installs tensorflow[and-cuda] instead of the CPU-only variant)
./init.sh --install-gpu
```

What each flag installs:

| Step | `--install` | `--install-gpu` |
|---|---|---|
| System packages (apt) | `python3 python3-pip ffmpeg ca-certificates zip unzip curl git build-essential` | same |
| Node 24 | via **nvm** (skipped if `node` already on `PATH`) | same |
| Deno | latest `DENO_VERSION` binary (skipped if already present) | same |
| Python packages | `requirements-cpu.txt` (yt-dlp, spleeter, ctc-forced-aligner) | `requirements.txt` (adds `tensorflow[and-cuda]`) |

The Dockerfiles use these flags during the image build step so the same script drives both local and containerised installs.

### Build

```bash
./init.sh --build
```

Runs `npm install` then `npm run build` from the repo root and exits. Equivalent to running those commands manually but convenient as a single entry point after `--install`. Output lands in `build/`.

### Combined install + build

```bash
./init.sh --install && ./init.sh --build
```

### Startup checker (runtime mode)

Running `init.sh` without flags (the Docker `ENTRYPOINT`) verifies all dependencies, downloads missing models, then starts the server:

1. **Dependency check** — confirms `node`, `python3`, `ffmpeg`, `yt-dlp`, `deno`, `spleeter`, and `ctc-forced-aligner` are present and prints versions.
2. **CTC alignment model** — downloads the ONNX model to `CTC_MODEL_PATH` if missing.
3. **Spleeter model** — downloads and verifies the `SPLEETER_MODEL` tarball to `SPLEETER_DATA` if missing or corrupt.
4. **Server start** — `exec node build/server/main.js` with any `LOG_LEVEL`-derived flags.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `NVM_DIR` | `$HOME/.nvm` | Where nvm is installed (install mode) |
| `DENO_VERSION` | `2.3.3` | Deno version to install |
| `CTC_USE_GPU` | `0` | Set to `1` to select GPU requirements file in `--install` mode |
| `CTC_MODEL_PATH` | `/data/ctc` | Where the ONNX alignment model is stored |
| `SPLEETER_MODEL` | `2stems` | Spleeter model name (`2stems` or `2stems-finetune`) |
| `SPLEETER_DATA` | `/data/spleeter` | Where Spleeter stores pretrained models |
| `LOG_LEVEL` | _(unset)_ | `off` / `error` / `warn` / `info` / `verbose` / `debug` or `0`–`5` |

## Discord & Support

Join the [Karaoke Eternal Discord Server](https://discord.gg/PgqVtFq) for general support and development chat, or just to say hi!

## Contributing & Development

Contributions are welcome! Please join the `#dev` channel of the [Discord Server](https://discord.gg/PgqVtFq) before embarking on major features; the project's scope is limited to ensure success.

Make sure you have [Node.js](https://nodejs.org/en/) v24 or later, then:

1. Fork and clone the repo
2. `npm i`
3. `npm run dev` and look for "Web server running at" for the **server URL**
