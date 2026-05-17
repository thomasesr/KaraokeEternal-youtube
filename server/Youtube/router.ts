import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'
import { YoutubeService, YoutubeApiError } from './YoutubeService.js'
import { Downloader, DownloaderError } from './Downloader.js'
import SpleeterDownloader from './SpleeterDownloader.js'
import AudioOnlyDownloader from './AudioOnlyDownloader.js'
import { searchByTitle, searchByArtistTitle } from './MusicBrainz.js'
import type {
  IYoutubeAccess,
  IYoutubePrefs,
  Prefs as PrefsType,
  YoutubeQualityPreset,
  YoutubeRole,
} from '../../shared/types.js'
import { YOUTUBE_QUALITY_PRESETS, YOUTUBE_ROLES } from '../../shared/types.js'

interface RequestWithBody {
  body: Record<string, unknown>
}

const log = getLogger('Youtube')
const router = new KoaRouter({ prefix: '/api/youtube' })

function getAvailableBackends (): string[] {
  const backends: string[] = []
  if (process.env.CTC_SERVICE_URL) backends.push('ctc')
  if (process.env.WHISPERX_SERVICE_URL) backends.push('whisperx')
  return backends
}

const DEFAULT_CONFIG: Omit<IYoutubePrefs, 'isApiKeyConfigured' | 'isApiKeyFromEnv' | 'isCookiesConfigured' | 'availableEnhancedLrcBackends'> = {
  isEnabled: false,
  downloadPathId: null,
  useCookies: false,
  qualityPreset: 'best',
  musicbrainzMinScore: 80,
  allowedRoles: ['admin'],
}

function normalizeAllowedRoles (input: unknown): YoutubeRole[] {
  const roles = new Set<YoutubeRole>(['admin'])
  if (Array.isArray(input)) {
    for (const r of input) {
      if (typeof r === 'string' && (YOUTUBE_ROLES as string[]).includes(r)) {
        roles.add(r as YoutubeRole)
      }
    }
  }
  return YOUTUBE_ROLES.filter(r => roles.has(r))
}

function getUserRole (
  ctxUser: { isAdmin?: boolean, isGuest?: boolean, role?: string | null } | undefined,
): YoutubeRole {
  if (ctxUser?.isAdmin) return 'admin'
  if (ctxUser?.role === 'room_manager') return 'room_manager'
  if (ctxUser?.isGuest) return 'guest'
  return 'standard'
}

const API_KEY_RE = /^[A-Za-z0-9_-]{20,128}$/
const Q_MAX_LEN = 200
const TITLE_MAX_LEN = 300
const ARTIST_MAX_LEN = 200
const COOKIES_MAX_LEN = 256 * 1024 // 256KB

function getStoredConfig (): Omit<IYoutubePrefs, 'isApiKeyConfigured' | 'isApiKeyFromEnv' | 'isCookiesConfigured' | 'availableEnhancedLrcBackends'> {
  const prefs = Prefs.get() as unknown as PrefsType
  const stored = (prefs.youtube as Partial<IYoutubePrefs> | undefined) ?? {}
  return {
    isEnabled: typeof stored.isEnabled === 'boolean' ? stored.isEnabled : DEFAULT_CONFIG.isEnabled,
    downloadPathId: typeof stored.downloadPathId === 'number' ? stored.downloadPathId : DEFAULT_CONFIG.downloadPathId,
    useCookies: typeof stored.useCookies === 'boolean' ? stored.useCookies : DEFAULT_CONFIG.useCookies,
    qualityPreset: YOUTUBE_QUALITY_PRESETS.includes(stored.qualityPreset as YoutubeQualityPreset)
      ? stored.qualityPreset as YoutubeQualityPreset
      : DEFAULT_CONFIG.qualityPreset,
    musicbrainzMinScore: typeof stored.musicbrainzMinScore === 'number'
      && stored.musicbrainzMinScore >= 0 && stored.musicbrainzMinScore <= 100
      ? stored.musicbrainzMinScore
      : DEFAULT_CONFIG.musicbrainzMinScore,
    allowedRoles: stored.allowedRoles === undefined
      ? [...DEFAULT_CONFIG.allowedRoles]
      : normalizeAllowedRoles(stored.allowedRoles),
  }
}

function getFullConfig (): IYoutubePrefs {
  return {
    ...getStoredConfig(),
    availableEnhancedLrcBackends: getAvailableBackends(),
    isApiKeyConfigured: !!Prefs.getYoutubeApiKey(),
    isApiKeyFromEnv: Prefs.isYoutubeApiKeyFromEnv(),
    isCookiesConfigured: !!Prefs.getYoutubeCookies(),
  }
}

function requireEnabled (ctx: any): ReturnType<typeof getStoredConfig> {
  if (!ctx.user?.userId) ctx.throw(401)
  const cfg = getStoredConfig()
  if (!cfg.isEnabled) ctx.throw(503, 'YouTube integration is disabled')
  const role = getUserRole(ctx.user)
  if (!cfg.allowedRoles.includes(role)) {
    ctx.throw(403, 'Your account is not allowed to use YouTube')
  }
  return cfg
}

router.get('/config', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)
  ctx.body = getFullConfig()
})

router.put('/config', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const body = (ctx.request as unknown as RequestWithBody).body ?? {}
  const next = getStoredConfig()

  if ('isEnabled' in body) {
    if (typeof body.isEnabled !== 'boolean') ctx.throw(422, 'isEnabled must be boolean')
    next.isEnabled = body.isEnabled as boolean
  }

  if ('useCookies' in body) {
    if (typeof body.useCookies !== 'boolean') ctx.throw(422, 'useCookies must be boolean')
    next.useCookies = body.useCookies as boolean
  }

  if ('qualityPreset' in body) {
    const v = body.qualityPreset
    if (!YOUTUBE_QUALITY_PRESETS.includes(v as YoutubeQualityPreset)) {
      ctx.throw(422, `qualityPreset must be one of: ${YOUTUBE_QUALITY_PRESETS.join(', ')}`)
    }
    next.qualityPreset = v as YoutubeQualityPreset
  }

  if ('musicbrainzMinScore' in body) {
    const v = body.musicbrainzMinScore
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) {
      ctx.throw(422, 'musicbrainzMinScore must be a number between 0 and 100')
    }
    next.musicbrainzMinScore = Math.round(v as number)
  }

  if ('allowedRoles' in body) {
    const v = body.allowedRoles
    if (!Array.isArray(v)) ctx.throw(422, 'allowedRoles must be an array')
    for (const r of v as unknown[]) {
      if (typeof r !== 'string' || !(YOUTUBE_ROLES as string[]).includes(r)) {
        ctx.throw(422, `allowedRoles entries must be one of: ${YOUTUBE_ROLES.join(', ')}`)
      }
    }
    next.allowedRoles = normalizeAllowedRoles(v)
  }

  if ('downloadPathId' in body) {
    const v = body.downloadPathId
    if (v !== null && (!Number.isInteger(v) || (v as number) < 0)) {
      ctx.throw(422, 'downloadPathId must be a non-negative integer or null')
    }
    if (Number.isInteger(v)) {
      const prefs = Prefs.get() as unknown as PrefsType
      if (!prefs.paths.entities[v as number]) {
        ctx.throw(422, 'downloadPathId does not match any media path')
      }
    }
    next.downloadPathId = v as number | null
  }

  Prefs.set('youtube', next)

  if ('apiKey' in body) {
    if (Prefs.isYoutubeApiKeyFromEnv()) {
      ctx.throw(409, 'YouTube API key is set via KES_YOUTUBE_API_KEY env var and cannot be modified at runtime')
    }
    const v = body.apiKey
    if (v === null || v === '') {
      Prefs.setYoutubeApiKey(null)
      log.info('%s cleared YouTube API key', ctx.user.name)
    } else if (typeof v === 'string' && API_KEY_RE.test(v)) {
      Prefs.setYoutubeApiKey(v)
      log.info('%s updated YouTube API key', ctx.user.name)
    } else {
      ctx.throw(422, 'Invalid apiKey format')
    }
  }

  if ('cookies' in body) {
    const v = body.cookies
    if (v === null || v === '') {
      Prefs.setYoutubeCookies(null)
      log.info('%s cleared YouTube cookies', ctx.user.name)
    } else if (typeof v === 'string') {
      if (v.length > COOKIES_MAX_LEN) {
        ctx.throw(413, `cookies content exceeds ${COOKIES_MAX_LEN} bytes`)
      }
      Prefs.setYoutubeCookies(v)
      log.info('%s updated YouTube cookies (%d bytes)', ctx.user.name, v.length)
    } else {
      ctx.throw(422, 'cookies must be a string')
    }
  }

  ctx.body = getFullConfig()
})

router.get('/access', (ctx) => {
  if (!ctx.user?.userId) ctx.throw(401)
  const cfg = getStoredConfig()
  const role = getUserRole(ctx.user)
  const body: IYoutubeAccess = {
    isEnabled: cfg.isEnabled,
    hasAccess: cfg.isEnabled && cfg.allowedRoles.includes(role),
    downloadPathConfigured: cfg.downloadPathId !== null,
    musicbrainzMinScore: cfg.musicbrainzMinScore,
  }
  ctx.body = body
})

const PAGE_TOKEN_MAX_LEN = 512

router.get('/search', async (ctx) => {
  requireEnabled(ctx)

  const q = typeof ctx.query.q === 'string' ? ctx.query.q.trim() : ''
  if (!q) ctx.throw(422, 'Missing query')
  if (q.length > Q_MAX_LEN) ctx.throw(422, `Query too long (max ${Q_MAX_LEN})`)

  const pageToken = typeof ctx.query.pageToken === 'string' && ctx.query.pageToken.length <= PAGE_TOKEN_MAX_LEN
    ? ctx.query.pageToken
    : undefined

  const hasKaraoke = /(^|\s)karaoke(\s|$)/i.test(q)
  const searchQuery = hasKaraoke ? q : `${q} karaoke`

  try {
    const page = await YoutubeService.search(searchQuery, pageToken)
    ctx.body = page
  } catch (err) {
    if (err instanceof YoutubeApiError) ctx.throw(err.status, err.message)
    throw err
  }
})

router.get('/identify', async (ctx) => {
  const cfg = requireEnabled(ctx)

  const title = typeof ctx.query.title === 'string' ? ctx.query.title.trim() : ''
  const artist = typeof ctx.query.artist === 'string' ? ctx.query.artist.trim() : ''

  if (!title) ctx.throw(422, 'Missing title')
  if (title.length > TITLE_MAX_LEN) ctx.throw(422, `title too long (max ${TITLE_MAX_LEN})`)
  if (artist.length > ARTIST_MAX_LEN) ctx.throw(422, `artist too long (max ${ARTIST_MAX_LEN})`)

  const hit = artist
    ? await searchByArtistTitle(artist, title)
    : await searchByTitle(title)

  if (hit && hit.score >= cfg.musicbrainzMinScore) {
    ctx.body = { found: true, artist: hit.artist, title: hit.title, score: hit.score }
  } else {
    ctx.body = { found: false, score: hit?.score ?? null }
  }
})

// Warms the server-side probe cache for a video before the download is
// initiated. Returns 204 on success so the client can fire-and-forget.
router.post('/probe/:videoId', async (ctx) => {
  const cfg = requireEnabled(ctx)
  const videoId = ctx.params.videoId
  if (!YoutubeService.isValidVideoId(videoId)) ctx.throw(422, 'Invalid videoId')
  try {
    await Downloader.probe(videoId, { qualityPreset: cfg.qualityPreset, useCookies: cfg.useCookies })
    ctx.status = 204
  } catch (err) {
    if (err instanceof DownloaderError) ctx.throw(err.status, err.message)
    throw err
  }
})

router.post('/download', async (ctx) => {
  const cfg = requireEnabled(ctx)
  if (cfg.downloadPathId === null) ctx.throw(422, 'No download path configured')
  if (!ctx.user.roomId) ctx.throw(409, 'You must be in a room to download')

  const prefs = Prefs.get() as unknown as PrefsType
  const pathEntry = prefs.paths.entities[cfg.downloadPathId]
  if (!pathEntry) ctx.throw(422, 'Configured download path no longer exists')

  const body = (ctx.request as unknown as RequestWithBody).body ?? {}
  const videoId = typeof body.videoId === 'string' ? body.videoId : ''
  const artist = typeof body.artist === 'string' ? body.artist.trim() : ''
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const duration = typeof body.duration === 'number' ? body.duration : 0
  const mode = body.mode === 'spleeter' ? 'spleeter' : body.mode === 'audioonly' ? 'audioonly' : 'karaoke'

  if (!YoutubeService.isValidVideoId(videoId)) ctx.throw(422, 'Invalid videoId')
  if (!artist) ctx.throw(422, 'Missing artist')
  if (!title) ctx.throw(422, 'Missing title')
  if (artist.length > ARTIST_MAX_LEN) ctx.throw(422, `artist too long (max ${ARTIST_MAX_LEN})`)
  if (title.length > TITLE_MAX_LEN) ctx.throw(422, `title too long (max ${TITLE_MAX_LEN})`)
  if (mode === 'spleeter' && !process.env.SPLEETER_SERVICE_URL) ctx.throw(503, 'Spleeter service not configured (set SPLEETER_SERVICE_URL)')

  try {
    const commonOpts = {
      destDir: pathEntry.path,
      pathId: cfg.downloadPathId,
      useCookies: cfg.useCookies,
      artist,
      title,
      duration,
      roomId: ctx.user.roomId,
      userId: ctx.user.userId,
      io: ctx.io,
    }
    const job = mode === 'spleeter'
      ? await SpleeterDownloader.start(videoId, commonOpts)
      : mode === 'audioonly'
        ? await AudioOnlyDownloader.start(videoId, commonOpts)
        : await Downloader.start(videoId, {
            ...commonOpts,
            qualityPreset: cfg.qualityPreset,
          })
    ctx.status = 202
    ctx.body = job
  } catch (err) {
    if (err instanceof DownloaderError) ctx.throw(err.status, err.message)
    throw err
  }
})

router.get('/download/:videoId', (ctx) => {
  if (!ctx.user.userId) ctx.throw(401)
  const videoId = ctx.params.videoId
  if (!YoutubeService.isValidVideoId(videoId)) ctx.throw(422, 'Invalid videoId')
  const job = Downloader.getJob(videoId) ?? SpleeterDownloader.getJob(videoId) ?? AudioOnlyDownloader.getJob(videoId)
  if (!job) ctx.throw(404, 'No such job')
  ctx.body = job
})

router.post('/download/:videoId/lyrics', (ctx) => {
  if (!ctx.user.userId) ctx.throw(401)
  const videoId = ctx.params.videoId
  if (!YoutubeService.isValidVideoId(videoId)) ctx.throw(422, 'Invalid videoId')
  const body = ctx.request.body as { lyricsText?: unknown }
  const lyricsText = body.lyricsText
  if (typeof lyricsText !== 'string' || !lyricsText.trim()) ctx.throw(422, 'lyricsText must be a non-empty string')
  const trimmed = (lyricsText as string).trim()
  try {
    AudioOnlyDownloader.submitLyrics(videoId, trimmed)
  } catch (err) {
    if (err instanceof DownloaderError) ctx.throw(err.status, err.message)
    throw err
  }
  ctx.status = 204
})

router.delete('/download/:videoId/lyrics', (ctx) => {
  if (!ctx.user.userId) ctx.throw(401)
  const videoId = ctx.params.videoId
  if (!YoutubeService.isValidVideoId(videoId)) ctx.throw(422, 'Invalid videoId')
  AudioOnlyDownloader.cancelLyrics(videoId)
  ctx.status = 204
})

export default router
