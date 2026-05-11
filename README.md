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

Microphones are *not* required since the player itself only outputs music - this allows your audio setup to be as simple or complex as you like. See the [F.A.Q.](https://www.karaoke-eternal.com/faq/#recommended-audio-microphone-setup) for more information.

## Getting Started

 Karaoke Eternal basically has 3 parts. See [Getting Started](https://www.karaoke-eternal.com/docs/getting-started/) to get up and running step-by-step, or jump to the documentation for each part below:
 
- **[Server:](https://www.karaoke-eternal.com/docs/karaoke-eternal-server/)** Runs on pretty much anything to serve the web app and your media files, including a Windows PC, Mac, or a dedicated server like a Raspberry Pi or Synology NAS.
- **[App:](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/)** Fast, modern mobile web app designed for "karaoke conditions".
- **[Player:](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/#player)** Just another part of the app, but meant to run fullscreen on the system handling audio/video for a [room](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/#rooms-admin-only)

## Installation

There are several [installation methods](https://www.karaoke-eternal.com/docs/karaoke-eternal-server/#installation) available for Karaoke Eternal Server.

## Discord & Support

Join the [Karaoke Eternal Discord Server](https://discord.gg/PgqVtFq) for general support and development chat, or just to say hi!

## Contributing & Development

Contributions are welcome! Please join the `#dev` channel of the [Discord Server](https://discord.gg/PgqVtFq) before embarking on major features; the project's scope is limited to ensure success.

Make sure you have [Node.js](https://nodejs.org/en/) v24 or later, then:

1. Fork and clone the repo
2. `npm i`
3. `npm run dev` and look for "Web server running at" for the **server URL**
