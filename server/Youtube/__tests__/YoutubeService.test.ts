import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { YoutubeService, YoutubeApiError } from '../YoutubeService.js'
import Prefs from '../../Prefs/Prefs.js'

const searchPayload = {
  items: [
    {
      id: { videoId: 'abcdefghijk' },
      snippet: {
        title: 'Song A (Karaoke)',
        channelTitle: 'Karaoke Co',
        publishedAt: '2024-01-01T00:00:00Z',
        thumbnails: {
          default: { url: 'https://i.ytimg.com/d.jpg' },
          medium: { url: 'https://i.ytimg.com/m.jpg' },
        },
      },
    },
    {
      // invalid id — must be filtered
      id: { videoId: 'bad!id' },
      snippet: {
        title: 'Bad', channelTitle: 'X', publishedAt: '', thumbnails: { default: { url: '' } },
      },
    },
  ],
}

const videosPayload = {
  items: [
    { id: 'abcdefghijk', contentDetails: { duration: 'PT3M42S' } },
  ],
}

describe('YoutubeService', () => {
  beforeEach(() => {
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue('test-key')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty for blank query without calling API', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await YoutubeService.search('')).toEqual([])
    expect(await YoutubeService.search('   ')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws 503 when API key missing', async () => {
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    await expect(YoutubeService.search('abc')).rejects.toBeInstanceOf(YoutubeApiError)
    await expect(YoutubeService.search('abc')).rejects.toMatchObject({ status: 503 })
  })

  it('builds search + videos URLs with correct params and parses results', async () => {
    const calls: string[] = []
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      calls.push(url)
      if (url.includes('/search')) {
        return new Response(JSON.stringify(searchPayload), { status: 200 })
      }
      if (url.includes('/videos')) {
        return new Response(JSON.stringify(videosPayload), { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await YoutubeService.search('foo bar')

    expect(calls[0]).toContain('googleapis.com/youtube/v3/search')
    expect(calls[0]).toContain('q=foo+bar')
    expect(calls[0]).toContain('part=snippet')
    expect(calls[0]).toContain('type=video')
    expect(calls[0]).toContain('videoCategoryId=10')
    expect(calls[0]).toContain('key=test-key')

    expect(calls[1]).toContain('/videos')
    expect(calls[1]).toContain('id=abcdefghijk')
    expect(calls[1]).not.toContain('bad!id')

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      videoId: 'abcdefghijk',
      title: 'Song A (Karaoke)',
      channel: 'Karaoke Co',
      thumbnail: 'https://i.ytimg.com/m.jpg',
      duration: 222,
    })
  })

  it('returns empty when no valid video ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })))
    expect(await YoutubeService.search('xyz')).toEqual([])
  })

  it('maps non-2xx to YoutubeApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota exceeded', { status: 403, statusText: 'Forbidden' })))
    await expect(YoutubeService.search('xyz')).rejects.toMatchObject({
      name: 'YoutubeApiError',
      status: 403,
    })
  })

  it('isValidVideoId enforces 11-char allowlist', () => {
    expect(YoutubeService.isValidVideoId('abcdefghijk')).toBe(true)
    expect(YoutubeService.isValidVideoId('AbC_-12345X')).toBe(true)
    expect(YoutubeService.isValidVideoId('short')).toBe(false)
    expect(YoutubeService.isValidVideoId('toolongvideoid')).toBe(false)
    expect(YoutubeService.isValidVideoId('bad!id12345')).toBe(false)
    expect(YoutubeService.isValidVideoId(null)).toBe(false)
  })
})
