# Karaokê-Hub

Sistema de festa de Karaokê baseado em Karaoke-forever — fork do [Karaoke Eternal](https://github.com/blisspot/karaoke-eternal) com suporte a YouTube, importação de áudio, letras aprimoradas e muito mais.

Host awesome karaoke parties where everyone can easily find and queue songs from their phone's browser. The player is fully browser-based with support for MP3+G, MP4 videos and WebGL visualizations. The server is self-hosted and runs on nearly everything.

[![Karaoke Eternal](/docs/assets/images/README.jpg?raw=true)](/docs/assets/images/README.jpg?raw=true)

<p align="center">
  <i>App in mobile browser (top) controlling player in desktop browser (bottom)</i>
</p>

## Features

- Plays MP3+G (with CDG lyrics; including zipped), MP4 videos, and music-synced visualizations
- Fast, modern mobile browser app designed for "karaoke conditions"
- Easy joining with QR codes and guest accounts
- Multiple simultaneous rooms/queues (optionally password-protected)
- Dynamic queues keep parties fair, fun and no-fuss
- Fully self-hosted — no ads or telemetry
- **[YouTube integration](MANUAL.md#youtube-integration)** (this fork): search YouTube from the library, auto-tag via MusicBrainz, queue tracks without a folder rescan
- **[Audio-only import](MANUAL.md#audio-only-import)** (this fork): drop MP3/FLAC/WAV/OGG/OPUS/AAC files in a folder; scanner separates vocals, fetches synced lyrics, and produces karaoke-ready archives automatically
- **[Enhanced LRC](MANUAL.md#enhanced-lrc)** (this fork): upgrade line-timed lyrics to per-word timestamps using ctc-forced-aligner for syllable-highlighted karaoke display
- **[Room manager role](MANUAL.md#room-manager-role)** (this fork): delegate per-room queue control and media preferences to a trusted user without full admin access
- **[Song scoring](MANUAL.md#song-scoring)** (this fork): 1–5 star voting after each song; animated results on the player; High Scores page with daily and all-time rankings
- **[Commercial video](MANUAL.md#commercial-video)** (this fork): play a filler MP4 after 30 s of queue idle time; interrupted the moment a new song is added
- **PWA / installable app** (this fork): install per room — each gets its own name, icon, and launch URL
- **Push notifications** (this fork): singers notified when it's their turn, even in the background
- **Color themes** (this fork): Dark Blue, Dark Green, Dark Red, Light — saved per user
- **Translations / i18n** (this fork): en_US and pt_BR included; add locales under `src/locales/`

See [MANUAL.md](MANUAL.md) for in-depth documentation on all fork features.

## Getting Started

Karaoke Eternal basically has 3 parts. See [Getting Started](https://www.karaoke-eternal.com/docs/getting-started/) to get up and running step-by-step, or jump to the documentation for each part below:

- **[Server](https://www.karaoke-eternal.com/docs/karaoke-eternal-server/):** Runs on pretty much anything to serve the web app and your media files, including a Windows PC, Mac, or a dedicated server like a Raspberry Pi or Synology NAS.
- **[App](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/):** Fast, modern mobile web app designed for "karaoke conditions".
- **[Player](https://www.karaoke-eternal.com/docs/karaoke-eternal-app/#player):** Fullscreen browser tab on the system handling audio/video for a room.

## Installation

There are several [installation methods](https://www.karaoke-eternal.com/docs/karaoke-eternal-server/#installation) available for Karaoke Eternal Server.

For this fork, `init.sh` handles dependency installation and server startup — see [init.sh in MANUAL.md](MANUAL.md#initsh).

## Discord & Support

Join the [Karaoke Eternal Discord Server](https://discord.gg/PgqVtFq) for general support and development chat, or just to say hi!

## Contributing & Development

Contributions are welcome! Please join the `#dev` channel of the [Discord Server](https://discord.gg/PgqVtFq) before embarking on major features; the project's scope is limited to ensure success.

Make sure you have [Node.js](https://nodejs.org/en/) v24 or later, then:

1. Fork and clone the repo
2. `npm i`
3. `npm run dev` and look for "Web server running at" for the **server URL**
