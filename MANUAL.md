# KaraokeEternal Fork — Manual

In-depth documentation for all features added in this fork.

- [YouTube Integration](#youtube-integration)
- [Audio-Only Import](#audio-only-import)
- [Enhanced LRC](#enhanced-lrc)
- [Room Manager Role](#room-manager-role)
- [Song Scoring](#song-scoring)
- [Commercial Video](#commercial-video)
- [init.sh](#initsh)

---

## YouTube Integration

This fork adds an opt-in YouTube workflow so any logged-in user can pull karaoke tracks straight into their room's queue.

- **Search:** Press <kbd>Enter</kbd> (or tap the YouTube button) in the library search bar to query YouTube. Results are biased toward karaoke versions; falls back to a plain query when nothing matches.
- **Auto-tagging via MusicBrainz:** On download, the video title is cleaned (strips `(Karaoke Version)`, `[Lyrics]`, `(HD)`, `- Topic`, etc.) and looked up against MusicBrainz. If the top match meets the admin-configured minimum score it is used silently; otherwise the user is prompted to confirm artist + song title (a second MusicBrainz pass canonicalizes their input).
- **Smart filenames:** Files land in your configured download folder as `Artist - Title.mp4`, sanitized for cross-platform filesystems. Duplicates auto-suffix as ` - yt1`, ` - yt2`, …
- **Direct ingest:** No folder rescan required. The download is inserted into the library (`artists` / `songs` / `media` rows) and the requesting user's queue, then broadcast to the room over the existing socket.
- **Quality + cookies:** Admin can cap resolution (best / 1080p / 720p / 480p / 360p) and provide a Netscape `cookies.txt` for age-gated or region-locked videos.
- **API key handling:** YouTube Data API v3 key can be set via the admin UI or the `KES_YOUTUBE_API_KEY` env var (env wins).
- **Room safety:** If the user's room is deleted mid-download, the finished file is removed and the queue insert is skipped.

### Server requirements

The download path shells out to `yt-dlp`, which in turn relies on a small toolchain. All of these must be available on the server's `PATH` (the bundled Dockerfile installs them automatically):

- **`yt-dlp`** — performs the probe + download. Keep current; YouTube changes break older releases regularly.
- **`ffmpeg`** — required for merge/remux when video and audio come from separate streams (most quality presets).
- **`deno`** (or another supported JS runtime) — required by yt-dlp's **EJS** challenge solver, which decrypts YouTube's signature and `n`-parameter on every video. Without a JS runtime, yt-dlp returns image-only formats and downloads fail with "no video streams".
- **Outbound HTTPS to `github.com`** — yt-dlp is invoked with `--remote-components ejs:github`, which fetches the EJS solver bundle from `github.com/yt-dlp/ejs` on first use (cached afterward in `~/.cache/yt-dlp`). Air-gapped deployments need to allowlist GitHub or pre-warm the cache.
- **Fresh `cookies.txt`** (optional but commonly required) — paste the Netscape-format export from a logged-in browser into the admin UI and enable "Use cookies". Stale cookies trigger YouTube's bot-challenge, which the server will surface as a distinct error message.

When a download fails, the server logs the full `yt-dlp` stderr tail and tags the user-visible error with a category (`EJS solver failed`, `bot-challenge`, etc.) so operators can act without re-running yt-dlp manually.

---

## Audio-Only Import

This fork can turn a folder of plain audio files into a karaoke library automatically. Enable it per media folder in **Account → Media Folders → (folder) → Process audio-only files**.

### Pipeline

When the scanner finds an audio file (`.mp3`, `.flac`, `.wav`, `.ogg`, `.opus`, `.aac`) with no `.cdg` or `.lrc` sidecar, and the folder has **Process audio-only files** enabled, it runs the following pipeline:

1. **Convert to MP3** — Non-MP3 formats are re-encoded to MP3 at 320 kbps CBR via `ffmpeg`. Existing MP3s are used as-is.
2. **Resolve artist & title** — Sources tried in order:
   - ID3/Vorbis tags embedded in the file.
   - Filename parsed as `Artist - Title` (leading track numbers like `01 - …` are ignored).
   - MusicBrainz recording search using the filename as the query.
   If none of these yield both an artist and a title, the file is skipped and left untouched.
3. **Vocal separation via spleeter-thomasesr** — The MP3 is processed with `spleeter separate` (default model: `2stems`). Both the accompaniment stem (`accompaniment.mp3`) and the vocal stem (`vocals.mp3`) are kept and bundled into the final archive.
4. **Synced lyrics via lrclib.net** — A timed `.lrc` file is fetched from [lrclib.net](https://lrclib.net) using the resolved artist, title, and duration. Files with no synced lyrics entry are skipped.
5. **Archive and ingest** — The accompaniment MP3, the vocal MP3, and the `.lrc` file are zipped as `Artist - Title.zip` in the same folder. The original audio file is deleted. The archive is indexed into the library on the next scan (no manual rescan needed — the archive is registered immediately).

### Server requirements

- **`ffmpeg`** — audio conversion and probe. Required for non-MP3 inputs.
- **`spleeter-thomasesr`** — vocal separation. Install via `pip install spleeter-thomasesr`. The pretrained model is downloaded automatically on first use to the path set by `SPLEETER_DATA` (default: `/data/spleeter`).
- **`zip`** — archive creation.
- **Outbound HTTPS to `lrclib.net`** — synced lyrics lookup.
- **Outbound HTTPS to `musicbrainz.org`** — metadata fallback when tags and filename parsing both fail.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SPLEETER_MODEL` | `2stems` | Spleeter model (`2stems`, `4stems`, `5stems`) |
| `SPLEETER_DATA` | `/data/spleeter` | Path where Spleeter stores pretrained models |
| `SPLEETER_USE_GPU` | _(unset)_ | Set to `1` to enable GPU acceleration |

---

## Enhanced LRC

This fork can upgrade standard line-timed `.lrc` files to **word-level timestamps** using [ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner). Word-level timing enables syllable-highlighted karaoke display instead of line-by-line highlighting.

### How it works

`ctc-forced-aligner` force-aligns the lyrics text against the vocal audio to produce per-word start/end times. The enhanced LRC is serialized with inline word tags and a `[re:ctc-forced-aligner]` header so the scanner can skip re-processing on future rescans.

Enhanced LRC is applied in two workflows:

- **YouTube downloads** — after spleeter vocal separation, the existing line-timed LRC (fetched from lrclib.net) is enhanced with per-word timestamps using the separated vocals as the audio reference.
- **Audio-only import** — when no synced LRC is available from lrclib.net, plain text lyrics are aligned directly against the vocal stem instead.

Language is detected automatically from the lyrics text (English, Japanese, Korean, Chinese, Russian, Arabic, Hebrew; defaults to English for other scripts).

### Configuration

Enable in **Account → YouTube → Enhanced LRC (word-level timestamps)**:

| Value | Behaviour |
|---|---|
| `none` (default) | Standard line-timed LRC; no ctc-forced-aligner invoked |
| `ctc` | Word-level timestamps added after every vocal separation |

### Server requirements

- **`ctc-forced-aligner`** — Python package. Installed by `./init.sh --install` / `--install-gpu` or manually via `pip install ctc-forced-aligner`.
- **ONNX alignment model** — downloaded automatically to `CTC_MODEL_PATH` on first startup.
- **`python3`** — used to invoke the alignment script.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `CTC_MODEL_PATH` | `/data/ctc` | Directory where the ONNX alignment model is cached |
| `CTC_USE_GPU` | `0` | Set to `1` to run ctc-forced-aligner on CUDA instead of CPU |

---

## Room Manager Role

This fork adds a `room_manager` role that sits between admin and standard user. Admins assign the role and link managers to specific rooms via **Account → Rooms**.

### What room managers can do

- **Queue control:** Move or remove *any* song in their room's queue, not just their own. Standard users can only move/remove songs they queued.
- **Room-level media version preference:** Choose which file version (CDG, MP4, LRC…) plays for a given song across the whole room. Set from the song-info panel. Overrides the global admin default; users' personal preferences still win over the room default.
- **YouTube search & download:** If the admin has granted `room_manager` access under **Account → YouTube**, room managers can search YouTube and download tracks directly into their room's queue — no admin session required.
- **Re-queue songs:** Re-add a previously played song to the queue.

### Media version resolution order

When multiple file versions exist for a song, the queue picks one using this priority (highest wins):

1. **User preference** — the singer's own explicit choice
2. **Room preference** — set by the room manager
3. **Global default** — the admin-flagged `isPreferred` file
4. **Path priority** — lowest-priority path, first file (automatic fallback)

---

## Song Scoring

After each song finishes playing, every user in the room can rate it 1–5 stars with half-star resolution.

### How it works

- **Voting UI** — the vote widget appears inline on the Queue page for the current song, and as a floating pop-up on all other pages.
- **Widget lifetime** — the widget auto-dismisses after `5 + votingWindow` seconds. Votes not cast in time are not counted.
- **Singer excluded** — the singer cannot vote on their own song.
- **Result** — after the voting window closes, the server computes the median score and broadcasts it to the room. The player animates the result as stars popping one by one, then holds the display for 4 seconds before advancing to the next song.
- **Skipped songs** — receive 0 stars and are not persisted.
- **Unvoted songs** (played to end with 0 votes) — automatically receive 5 stars but are excluded from all high-score rankings.

### Room configuration

Admins and room managers configure scoring under **Account → Rooms → (room) → Song Scoring**:

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

Songs and singers with only auto-5-star rows (0 real votes) are excluded from all rankings.

---

## Commercial Video

When the queue is empty, the player can automatically play a promotional or filler MP4 video after a 30-second delay. As soon as a new song is added to the queue, the commercial is interrupted and a live countdown appears on the player screen before playback resumes.

### How it works

1. Queue is exhausted — player reaches the end of the queue.
2. After **30 seconds** of idle time, the commercial video starts playing on the player screen.
3. A **new song is queued** — the commercial stops immediately and a countdown to the next song is displayed.
4. Countdown reaches zero — normal karaoke playback resumes.

If no commercial video is uploaded, or the feature is disabled for the room, the player shows the standard empty-queue message instead.

### Video resolution order

| Priority | Source |
|---|---|
| 1 (highest) | Room override — MP4 uploaded by a room manager for this specific room |
| 2 | Global video — MP4 uploaded by an admin, shared across all rooms |

### Configuration

**Admin** — upload or remove the global video in **Account → Preferences → Commercial Video** (MP4 only).

**Room managers** — configure the feature per room in **Account → Rooms → (room) → Commercial Video**:

| Setting | Description |
|---|---|
| Show commercial video when queue is empty | Per-room toggle; default on. When off, the player shows the empty-queue message instead |
| Upload room override | Upload an MP4 that overrides the global video for this room only |
| Remove room override | Revert to the global video (or no video if none is uploaded) |

### Storage

Commercial videos are stored on the server under `{KES_PATH_DATA}/commercials/`:

```
commercials/
  global/
    commercial.mp4        ← global fallback (admin-managed)
  rooms/
    {roomId}/
      commercial.mp4      ← room override (room manager-managed)
```

---

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
