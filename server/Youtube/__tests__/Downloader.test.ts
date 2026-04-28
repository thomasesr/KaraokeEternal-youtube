import { describe, expect, it } from 'vitest'
import { selectFormats } from '../Downloader.js'

const fmt = (o: Record<string, unknown>) => ({ format_id: 'x', ...o }) as Parameters<typeof selectFormats>[0][number]

describe('selectFormats', () => {
  const audioM4a = fmt({ format_id: 'a-m4a', acodec: 'mp4a.40.2', vcodec: 'none', ext: 'm4a', abr: 128 })
  const audioWebm = fmt({ format_id: 'a-webm', acodec: 'opus', vcodec: 'none', ext: 'webm', abr: 160 })
  const v720mp4 = fmt({ format_id: 'v-720-mp4', vcodec: 'avc1.4d401f', ext: 'mp4', height: 720, tbr: 2000 })
  const v1080mp4 = fmt({ format_id: 'v-1080-mp4', vcodec: 'avc1.640028', ext: 'mp4', height: 1080, tbr: 4000 })
  const v1080webm = fmt({ format_id: 'v-1080-webm', vcodec: 'vp9', ext: 'webm', height: 1080, tbr: 5000 })
  const v2160webm = fmt({ format_id: 'v-2160-webm', vcodec: 'vp9', ext: 'webm', height: 2160, tbr: 9000 })

  it('picks best mp4 video <= cap and m4a audio, no remux', () => {
    const sel = selectFormats([audioM4a, audioWebm, v720mp4, v1080mp4, v1080webm], 1080)
    expect(sel).toEqual({ videoId: 'v-1080-mp4', audioId: 'a-m4a', needsRemux: false })
  })

  it('caps below 1080 picks 720 mp4', () => {
    const sel = selectFormats([audioM4a, v720mp4, v1080mp4, v1080webm], 720)
    expect(sel?.videoId).toBe('v-720-mp4')
    expect(sel?.needsRemux).toBe(false)
  })

  it('falls back to non-mp4 + remux when no mp4 candidate <= cap', () => {
    const sel = selectFormats([audioWebm, v2160webm, v1080webm], 1080)
    expect(sel?.videoId).toBe('v-1080-webm')
    expect(sel?.audioId).toBe('a-webm')
    expect(sel?.needsRemux).toBe(true)
  })

  it('null cap = best overall, prefers mp4 if any', () => {
    const sel = selectFormats([audioM4a, v1080mp4, v2160webm], null)
    expect(sel?.videoId).toBe('v-1080-mp4')
    expect(sel?.needsRemux).toBe(false)
  })

  it('null cap with only webm picks highest webm + remux', () => {
    const sel = selectFormats([audioWebm, v1080webm, v2160webm], null)
    expect(sel?.videoId).toBe('v-2160-webm')
    expect(sel?.needsRemux).toBe(true)
  })

  it('returns null when no video formats meet cap', () => {
    const sel = selectFormats([audioM4a, v1080mp4], 360)
    expect(sel).toBeNull()
  })

  it('audio-only allowed (no audio formats)', () => {
    const sel = selectFormats([v720mp4], 1080)
    expect(sel).toEqual({ videoId: 'v-720-mp4', audioId: null, needsRemux: false })
  })
})
