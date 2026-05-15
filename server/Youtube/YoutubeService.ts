import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'

const log = getLogger('Youtube')
const API_BASE = 'https://www.googleapis.com/youtube/v3'
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/

export interface YoutubeSearchResult {
  videoId: string
  title: string
  channel: string
  publishedAt: string
  thumbnail: string
  duration: number
  viewCount: number
  isKaraoke: boolean
}

export interface YoutubeSearchPage {
  results: YoutubeSearchResult[]
  nextPageToken: string | null
}

export class YoutubeApiError extends Error {
  status: number
  constructor (message: string, status: number) {
    super(message)
    this.name = 'YoutubeApiError'
    this.status = status
  }
}

interface SearchListItem {
  id: { videoId: string }
  snippet: {
    title: string
    channelTitle: string
    publishedAt: string
    thumbnails: Record<string, { url: string }>
  }
}

interface VideosListItem {
  id: string
  contentDetails: { duration: string }
  statistics: { viewCount?: string }
}

function parseIsoDuration (iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso)
  if (!m) return 0
  const [, h = '0', mn = '0', s = '0'] = m
  return parseInt(h, 10) * 3600 + parseInt(mn, 10) * 60 + parseInt(s, 10)
}

async function apiGet<T> (path: string, params: Record<string, string>, apiKey: string, signal?: AbortSignal): Promise<T> {
  const url = new URL(`${API_BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('key', apiKey)

  const res = await fetch(url, { signal })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    log.warn('YouTube API %s %d: %s', path, res.status, body.slice(0, 200))
    throw new YoutubeApiError(`YouTube API error: ${res.statusText}`, res.status)
  }

  return res.json() as Promise<T>
}

export class YoutubeService {
  static async search (query: string, pageToken?: string, signal?: AbortSignal): Promise<YoutubeSearchPage> {
    const q = (query ?? '').trim()
    if (!q) return { results: [], nextPageToken: null }

    const apiKey = Prefs.getYoutubeApiKey()
    if (!apiKey) throw new YoutubeApiError('YouTube API key not configured', 503)

    const searchParams: Record<string, string> = {
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10', // music
      maxResults: '10',
      q,
    }
    if (pageToken) searchParams.pageToken = pageToken

    const searchData = await apiGet<{ items: SearchListItem[], nextPageToken?: string }>('/search', searchParams, apiKey, signal)

    const ids = searchData.items
      .map(i => i.id?.videoId)
      .filter((id): id is string => typeof id === 'string' && VIDEO_ID_RE.test(id))

    if (!ids.length) return { results: [], nextPageToken: null }

    const videosData = await apiGet<{ items: VideosListItem[] }>('/videos', {
      part: 'contentDetails,statistics',
      id: ids.join(','),
    }, apiKey, signal)

    const metaById = new Map(videosData.items.map(v => [v.id, v]))

    const results = searchData.items
      .filter(item => metaById.has(item.id.videoId))
      .map((item) => {
        const meta = metaById.get(item.id.videoId)!
        return {
          videoId: item.id.videoId,
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnail: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '',
          duration: parseIsoDuration(meta.contentDetails.duration),
          viewCount: parseInt(meta.statistics.viewCount ?? '0', 10) || 0,
          isKaraoke: /karaoke/i.test(item.snippet.title),
        }
      })

    return {
      results,
      nextPageToken: searchData.nextPageToken ?? null,
    }
  }

  static isValidVideoId (id: unknown): id is string {
    return typeof id === 'string' && VIDEO_ID_RE.test(id)
  }
}

export default YoutubeService
