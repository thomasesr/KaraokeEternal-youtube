import React from 'react'
import HttpApi from 'lib/HttpApi'
import styles from './LRCPlayer.css'

const api = new HttpApi('media')

interface LRCWord {
  time: number
  text: string
}

interface LRCLine {
  time: number
  text: string
  words?: LRCWord[]
}

interface LRCPlayerProps {
  artistName: string
  cdgAlpha: number
  isPlaying: boolean
  lrcFontSize: number
  lrcOffset: number
  lrcSmoothScroll: boolean
  mediaId: number
  mediaKey: string
  mediaReplayKey?: number
  songTitle: string
  width: number
  height: number
  onAudioElement(audio: HTMLAudioElement): void
  onEnd(): void
  onError(error: string): void
  onLoad(): void
  onPlay(): void
  onStatus(status: { position: number, duration?: number }): void
}

class LRCPlayer extends React.Component<LRCPlayerProps> {
  audio = React.createRef<HTMLAudioElement>()
  container = React.createRef<HTMLDivElement>()
  lyricsInner = React.createRef<HTMLDivElement>()
  lineRefs: React.RefObject<HTMLDivElement>[] = []
  wordSpanRefs: HTMLSpanElement[] = []
  rafId: number | null = null
  activeLineIdx = -1
  activeWordIdx = -1
  scrollTargetIdx = -1
  metaFadeTriggered = false

  state = {
    lines: [] as LRCLine[],
    lrcArtist: '',
    lrcTitle: '',
    metaFading: false,
    showMeta: false,
  }

  componentDidMount () {
    this.props.onAudioElement(this.audio.current)
    this.updateSources()
    this.startRAF()
  }

  componentWillUnmount () {
    this.stopRAF()
  }

  componentDidUpdate (prevProps: LRCPlayerProps, prevState: typeof this.state) {
    if (prevProps.mediaKey !== this.props.mediaKey) {
      this.updateSources()
      return
    }

    if (prevProps.mediaReplayKey !== this.props.mediaReplayKey) {
      this.audio.current.currentTime = 0
      return
    }

    if (prevProps.isPlaying !== this.props.isPlaying) {
      this.updateIsPlaying()
    }

    if (prevState.lines !== this.state.lines) {
      this.updateTranslate(true)
    }
  }

  lineOpacity (dist: number) {
    return Math.max(0, Math.pow(0.35, dist))
  }

  updateTranslate = (snap: boolean, targetIndex?: number) => {
    const { lines } = this.state
    if (!lines.length || !this.container.current || !this.lyricsInner.current) return

    const idx = targetIndex ?? (this.activeLineIdx >= 0 ? this.activeLineIdx : 0)
    const lineRef = this.lineRefs[idx]
    if (!lineRef?.current) return

    const containerHeight = this.container.current.clientHeight
    const lineEl = lineRef.current
    const translateY = containerHeight / 2 - lineEl.offsetTop - lineEl.offsetHeight / 2

    const inner = this.lyricsInner.current
    const animated = !snap && this.props.lrcSmoothScroll
    if (!animated) {
      inner.style.transition = 'none'
      inner.style.transform = `translateY(${translateY}px)`
      inner.offsetHeight // force reflow so next transition change applies cleanly
    } else {
      inner.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
      inner.style.transform = `translateY(${translateY}px)`
    }
  }

  render () {
    const { lines, lrcArtist, lrcTitle, metaFading, showMeta } = this.state
    const { cdgAlpha, lrcFontSize } = this.props
    const focusIndex = this.activeLineIdx >= 0 ? this.activeLineIdx : 0

    return (
      <div
        className={styles.container}
        ref={this.container}
        style={{ '--lrc-font-scale': lrcFontSize } as React.CSSProperties}
      >
        <div
          className={styles.lyricsBlur}
          style={{ opacity: Math.min(1, cdgAlpha * 2), backgroundColor: `rgba(0,0,0,${Math.min(1, cdgAlpha * 1.4)})` }}
        />
        {showMeta && (
          <div className={`${styles.meta}${metaFading ? ` ${styles.metaFading}` : ''}`}>
            <div className={styles.metaCard}>
              {lrcTitle && <div className={styles.metaTitle}>{lrcTitle}</div>}
              {lrcArtist && <div className={styles.metaArtist}>{lrcArtist}</div>}
            </div>
          </div>
        )}
        <div className={styles.lyricsOuter}>
          <div className={styles.lyricsInner} ref={this.lyricsInner}>
            {lines.map((line, i) => {
              const dist = Math.abs(i - focusIndex)
              return (
                <div
                  key={i}
                  ref={this.lineRefs[i]}
                  className={`${styles.line}${i === this.activeLineIdx ? ` ${styles.active}` : ''}`}
                  style={{ opacity: this.lineOpacity(dist) }}
                >
                  {line.words
                    ? line.words.map((w, wi) => (
                        <React.Fragment key={wi}>
                          <span data-wi={String(wi)}>{w.text}</span>
                          {wi < line.words!.length - 1 && ' '}
                        </React.Fragment>
                      ))
                    : line.text}
                </div>
              )
            })}
          </div>
        </div>
        <audio
          preload='auto'
          onCanPlayThrough={this.updateIsPlaying}
          onEnded={this.props.onEnd}
          onError={this.handleError}
          onLoadStart={this.props.onLoad}
          onPlay={this.props.onPlay}
          ref={this.audio}
        />
      </div>
    )
  }

  updateSources = async () => {
    try {
      const response = await api.get(`/${this.props.mediaId}?type=lrc`)
      if (!(response instanceof Response)) return
      const text = await response.text()
      if (!this.audio.current) return

      const { lines, artist, title } = parseLRC(text)
      const lrcArtist = this.props.artistName || artist
      const lrcTitle = this.props.songTitle || title
      this.lineRefs = lines.map(() => React.createRef<HTMLDivElement>())
      this.activeLineIdx = -1
      this.scrollTargetIdx = -1
      this.metaFadeTriggered = false
      this.setState({ lines, lrcArtist, lrcTitle, metaFading: false, showMeta: !!(lrcArtist || lrcTitle) })
      this.audio.current.src = `${document.baseURI}api/media/${this.props.mediaId}?type=audio`
      this.audio.current.load()
    } catch (err) {
      this.props.onError(err.message)
    }
  }

  startRAF = () => {
    const tick = () => {
      this.syncLyrics()
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stopRAF = () => {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  syncLyrics = () => {
    if (!this.audio.current || this.audio.current.paused) return
    const pos = this.audio.current.currentTime - this.props.lrcOffset / 1000

    this.props.onStatus({ position: pos, duration: this.audio.current.duration || 0 })

    const { lines } = this.state

    if (!this.metaFadeTriggered && this.state.showMeta && lines.length > 0 && pos >= lines[0].time - 0.75) {
      this.metaFadeTriggered = true
      this.setState({ metaFading: true })
    }

    let newActive = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= pos) newActive = i
      else break
    }

    // pre-scroll: start translating to next line 450ms before it activates
    const preScrollIdx = newActive + 1
    if (
      preScrollIdx < lines.length
      && preScrollIdx > this.scrollTargetIdx
      && pos >= lines[preScrollIdx].time - 0.45
    ) {
      this.scrollTargetIdx = preScrollIdx
      this.updateTranslate(false, preScrollIdx)
    }

    if (newActive !== this.activeLineIdx) {
      const oldActive = this.activeLineIdx
      this.activeLineIdx = newActive
      if (newActive < this.scrollTargetIdx - 1) this.scrollTargetIdx = newActive

      if (oldActive === -1 && newActive >= 0 && this.state.showMeta) {
        this.setState({ showMeta: false, metaFading: false })
      }

      // toggle active class directly — no setState, no re-render
      if (oldActive >= 0) {
        this.lineRefs[oldActive]?.current?.classList.remove(styles.active)
        this.lineRefs[oldActive]?.current?.classList.add(styles.lineSung)
      }
      if (newActive >= 0) {
        this.lineRefs[newActive]?.current?.classList.remove(styles.lineSung)
        this.lineRefs[newActive]?.current?.classList.add(styles.active)
      }

      // update opacity for affected lines (±4 from old and new)
      const focusIndex = newActive >= 0 ? newActive : 0
      const rangeStart = Math.max(0, Math.min(oldActive >= 0 ? oldActive : focusIndex, focusIndex) - 4)
      const rangeEnd = Math.min(lines.length - 1, Math.max(oldActive >= 0 ? oldActive : focusIndex, focusIndex) + 4)
      for (let i = rangeStart; i <= rangeEnd; i++) {
        const el = this.lineRefs[i]?.current
        if (el) el.style.opacity = String(this.lineOpacity(Math.abs(i - focusIndex)))
      }

      this.updateTranslate(false)

      // reset word highlight refs for new line — old words keep .wordSung (stay gold)
      this.wordSpanRefs = []
      this.activeWordIdx = -1
      if (newActive >= 0 && lines[newActive].words && this.lineRefs[newActive]?.current) {
        this.wordSpanRefs = Array.from(
          this.lineRefs[newActive].current!.querySelectorAll<HTMLSpanElement>('[data-wi]'),
        )
      }
    }

    // word highlight sync (every tick)
    if (newActive >= 0 && this.wordSpanRefs.length > 0 && lines[newActive].words) {
      const words = lines[newActive].words!
      let newWordIdx = -1
      for (let wi = 0; wi < words.length; wi++) {
        if (words[wi].time <= pos) newWordIdx = wi
        else break
      }
      if (newWordIdx !== this.activeWordIdx) {
        // past words keep .wordSung (stay gold) — only add to newly sung word
        if (newWordIdx >= 0) this.wordSpanRefs[newWordIdx]?.classList.add(styles.wordSung)
        this.activeWordIdx = newWordIdx
      }
    }
  }

  updateIsPlaying = () => {
    if (!this.audio.current) return

    if (this.props.isPlaying) {
      this.audio.current.play()
        .catch(err => this.props.onError(err.message))
    } else {
      this.audio.current.pause()
    }
  }

  handleError = (el: React.SyntheticEvent<HTMLAudioElement>) => {
    const { message, code } = el.currentTarget.error
    this.props.onError(`${message} (code ${code})`)
  }
}

function parseLRC (text: string): { lines: LRCLine[], artist: string, title: string } {
  const lines: LRCLine[] = []
  const tagRe = /\[(\d{1,2}):(\d{2})[.:]([\d]{2,3})\]/g
  let offsetSecs = 0
  let artist = ''
  let title = ''

  for (const rawLine of text.split('\n')) {
    const offsetMatch = rawLine.match(/^\[offset:\s*([+-]?\d+)\s*\]/)
    if (offsetMatch) {
      offsetSecs = parseInt(offsetMatch[1], 10) / 1000
      continue
    }

    const arMatch = rawLine.match(/^\[ar:\s*(.+?)\s*\]/)
    if (arMatch) { artist = arMatch[1]; continue }

    const tiMatch = rawLine.match(/^\[ti:\s*(.+?)\s*\]/)
    if (tiMatch) { title = tiMatch[1]; continue }

    const lyric = rawLine
      .replace(/\[\d{1,2}:\d{2}[.:]\d{2,3}\]/g, '')
      .replace(/<\d{1,2}:\d{2}[.:]\d{2,3}>/g, '')
      .trim()
    if (!lyric || /^\[(?:al|by|length|re|ve):/.test(rawLine)) continue

    // parse word-level timestamps (<mm:ss.cs>word)
    const wordTagRe = /<(\d{1,2}):(\d{2})[.:](\d{2,3})>([^<\[]*)/g
    let wm: RegExpExecArray | null
    const words: LRCWord[] = []
    wordTagRe.lastIndex = 0
    while ((wm = wordTagRe.exec(rawLine)) !== null) {
      const wtime = parseInt(wm[1], 10) * 60 + parseInt(wm[2], 10) + (
        wm[3].length === 3 ? parseInt(wm[3], 10) / 1000 : parseInt(wm[3], 10) / 100
      )
      const wtext = wm[4].trim()
      if (wtext) words.push({ time: wtime + offsetSecs, text: wtext })
    }

    let match: RegExpExecArray | null
    tagRe.lastIndex = 0
    while ((match = tagRe.exec(rawLine)) !== null) {
      const mins = parseInt(match[1], 10)
      const secs = parseInt(match[2], 10)
      const frac = match[3].length === 3
        ? parseInt(match[3], 10) / 1000
        : parseInt(match[3], 10) / 100
      lines.push({ time: mins * 60 + secs + frac + offsetSecs, text: lyric, words: words.length > 0 ? words : undefined })
    }
  }

  return { lines: lines.sort((a, b) => a.time - b.time), artist, title }
}

export default LRCPlayer
