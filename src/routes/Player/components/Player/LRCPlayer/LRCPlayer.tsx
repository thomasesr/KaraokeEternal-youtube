import React from 'react'
import HttpApi from 'lib/HttpApi'
import styles from './LRCPlayer.css'

const api = new HttpApi('media')

interface LRCLine {
  time: number
  text: string
}

interface LRCPlayerProps {
  isPlaying: boolean
  mediaId: number
  mediaKey: string
  mediaReplayKey?: number
  width: number
  height: number
  onAudioElement(audio: HTMLAudioElement): void
  onEnd(): void
  onError(error: string): void
  onLoad(): void
  onPlay(): void
  onStatus(status: { position: number }): void
}

class LRCPlayer extends React.Component<LRCPlayerProps> {
  audio = React.createRef<HTMLAudioElement>()

  state = {
    lines: [] as LRCLine[],
    activeLine: -1,
  }

  componentDidMount () {
    this.props.onAudioElement(this.audio.current)
    this.updateSources()
  }

  componentDidUpdate (prevProps: LRCPlayerProps) {
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
  }

  render () {
    const { lines, activeLine } = this.state

    return (
      <div className={styles.container}>
        <div className={styles.lyrics}>
          {lines.map((line, i) => (
            <div
              key={i}
              className={[
                styles.line,
                i === activeLine ? styles.active : '',
                i < activeLine ? styles.past : '',
              ].join(' ')}
            >
              {line.text}
            </div>
          ))}
        </div>
        <audio
          preload='auto'
          onCanPlayThrough={this.updateIsPlaying}
          onEnded={this.props.onEnd}
          onError={this.handleError}
          onLoadStart={this.props.onLoad}
          onPlay={this.props.onPlay}
          onTimeUpdate={this.handleTimeUpdate}
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

      this.setState({ lines: parseLRC(text), activeLine: -1 })
      this.audio.current.src = `${document.baseURI}api/media/${this.props.mediaId}?type=audio`
      this.audio.current.load()
    } catch (err) {
      this.props.onError(err.message)
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

  handleTimeUpdate = () => {
    if (!this.audio.current) return
    const pos = this.audio.current.currentTime

    this.props.onStatus({ position: pos })

    const { lines } = this.state
    let activeLine = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= pos) activeLine = i
      else break
    }

    if (activeLine !== this.state.activeLine) {
      this.setState({ activeLine })
    }
  }
}

function parseLRC (text: string): LRCLine[] {
  const lines: LRCLine[] = []
  // match [mm:ss.xx] or [mm:ss:xx] timestamp tags
  const tagRe = /\[(\d{1,2}):(\d{2})[.:]([\d]{2,3})\]/g

  for (const rawLine of text.split('\n')) {
    const lyric = rawLine.replace(/\[\d{1,2}:\d{2}[.:]\d{2,3}\]/g, '').trim()
    // skip metadata tags and blank lines
    if (!lyric || /^\[(?:ar|ti|al|by|offset|length|re|ve):/.test(rawLine)) continue

    let match: RegExpExecArray | null
    tagRe.lastIndex = 0
    while ((match = tagRe.exec(rawLine)) !== null) {
      const mins = parseInt(match[1], 10)
      const secs = parseInt(match[2], 10)
      const frac = match[3].length === 3
        ? parseInt(match[3], 10) / 1000
        : parseInt(match[3], 10) / 100
      lines.push({ time: mins * 60 + secs + frac, text: lyric })
    }
  }

  return lines.sort((a, b) => a.time - b.time)
}

export default LRCPlayer
