import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import http from 'node:http'
import Koa from 'koa'
import { koaBody } from 'koa-body'
import router from '../router.js'
import Prefs from '../../Prefs/Prefs.js'
import { YoutubeService, YoutubeApiError, YoutubeSearchPage } from '../YoutubeService.js'
import { Downloader } from '../Downloader.js'
import * as MB from '../MusicBrainz.js'

interface FakeUser {
  userId: number | null
  isAdmin: boolean
  isGuest?: boolean
  role?: string | null
  name: string
  roomId: number | null
}

let server: http.Server
let baseUrl: string
let currentUser: FakeUser = { userId: 1, isAdmin: true, isGuest: false, name: 'admin', roomId: 1 }

beforeAll(async () => {
  const app = new Koa()
  app.use(async (ctx, next) => {
    ctx.user = currentUser
    try {
      await next()
    } catch (err: any) {
      ctx.status = err.status || 500
      ctx.body = { error: err.message }
    }
  })
  app.use(koaBody())
  app.use(router.routes())
  server = http.createServer(app.callback())
  await new Promise<void>(resolve => server.listen(0, resolve))
  const addr = server.address() as { port: number }
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
})

const buildPrefsResult = (overrides: Record<string, unknown> = {}) => ({
  paths: { result: [], entities: {} },
  roles: { result: [], entities: {} },
  ...overrides,
})

beforeEach(() => {
  currentUser = { userId: 1, isAdmin: true, isGuest: false, name: 'admin', roomId: 1 }
  // default safe stubs so getFullConfig() never hits the real DB
  vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('YouTube router — auth', () => {
  it('rejects non-admin on /config', async () => {
    currentUser = { userId: 2, isAdmin: false, isGuest: false, name: 'standard', roomId: 1 }
    const res = await fetch(`${baseUrl}/api/youtube/config`)
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated on /search', async () => {
    currentUser = { userId: null, isAdmin: false, isGuest: false, name: 'anon', roomId: null }
    const res = await fetch(`${baseUrl}/api/youtube/search?q=foo`)
    expect(res.status).toBe(401)
  })

  it('rejects non-admin on /search when role not in allowedRoles (default)', async () => {
    currentUser = { userId: 2, isAdmin: false, isGuest: false, name: 'standard', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(403)
  })

  it('allows standard user on /search when role explicitly allowed', async () => {
    currentUser = { userId: 2, isAdmin: false, isGuest: false, name: 'standard', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'standard'] },
    }) as any)
    vi.spyOn(YoutubeService, 'search').mockResolvedValue({ results: [], nextPageToken: null } as YoutubeSearchPage)

    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [], nextPageToken: null })
  })

  it('allows guest on /search when role explicitly allowed', async () => {
    currentUser = { userId: 3, isAdmin: false, isGuest: true, name: 'guest-x', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'guest'] },
    }) as any)
    vi.spyOn(YoutubeService, 'search').mockResolvedValue({ results: [], nextPageToken: null } as YoutubeSearchPage)

    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(200)
  })

  it('allows room_manager on /search when role explicitly allowed', async () => {
    currentUser = { userId: 7, isAdmin: false, isGuest: false, role: 'room_manager', name: 'mgr', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'room_manager'] },
    }) as any)
    vi.spyOn(YoutubeService, 'search').mockResolvedValue({ results: [], nextPageToken: null } as YoutubeSearchPage)

    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(200)
  })

  it('rejects room_manager on /search when only standard allowed', async () => {
    currentUser = { userId: 7, isAdmin: false, isGuest: false, role: 'room_manager', name: 'mgr', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'standard'] },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(403)
  })

  it('rejects guest on /search when only standard allowed', async () => {
    currentUser = { userId: 3, isAdmin: false, isGuest: true, name: 'guest-x', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'standard'] },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(403)
  })

  it('rejects non-admin on PUT /config', async () => {
    currentUser = { userId: 2, isAdmin: false, isGuest: false, name: 'standard', roomId: 1 }
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isEnabled: true }),
    })
    expect(res.status).toBe(401)
  })
})

describe('YouTube router — GET /config', () => {
  it('returns defaults when nothing stored', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)

    const res = await fetch(`${baseUrl}/api/youtube/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isEnabled: false,
      downloadPathId: null,
      useCookies: false,
      qualityPreset: 'best',
      musicbrainzMinScore: 80,
      allowedRoles: ['admin'],
      isApiKeyConfigured: false,
      isApiKeyFromEnv: false,
      isCookiesConfigured: false,
    })
  })

  it('returns stored config + isApiKeyConfigured=true when key set', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 7, useCookies: true },
      paths: { result: [7], entities: { 7: { pathId: 7, path: '/x', priority: 0, prefs: {} } } },
    }) as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue('AIzaSyDxxxxxxxxxxxxxxxxxxxxxx')
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue('# cookies file')

    const res = await fetch(`${baseUrl}/api/youtube/config`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isEnabled: true,
      downloadPathId: 7,
      useCookies: true,
      qualityPreset: 'best',
      musicbrainzMinScore: 80,
      allowedRoles: ['admin'],
      isApiKeyConfigured: true,
      isApiKeyFromEnv: false,
      isCookiesConfigured: true,
    })
  })
})

describe('YouTube router — PUT /config', () => {
  it('sets isEnabled and useCookies', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isEnabled: true, useCookies: true }),
    })

    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({
      isEnabled: true,
      useCookies: true,
      downloadPathId: null,
    }))
  })

  it('rejects non-boolean isEnabled', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isEnabled: 'yes' }),
    })
    expect(res.status).toBe(422)
  })

  it('rejects unknown downloadPathId', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      paths: { result: [1], entities: { 1: { pathId: 1, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ downloadPathId: 999 }),
    })
    expect(res.status).toBe(422)
  })

  it('accepts valid downloadPathId', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ downloadPathId: 3 }),
    })
    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({ downloadPathId: 3 }))
  })

  it('accepts valid qualityPreset', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qualityPreset: '720p' }),
    })
    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({ qualityPreset: '720p' }))
  })

  it('rejects unknown qualityPreset', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qualityPreset: '4k' }),
    })
    expect(res.status).toBe(422)
  })

  it('rejects non-string qualityPreset', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ qualityPreset: 1080 }),
    })
    expect(res.status).toBe(422)
  })

  it('persists previously stored qualityPreset across unrelated PUT', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, qualityPreset: '480p' },
    }) as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isEnabled: false }),
    })
    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({ qualityPreset: '480p' }))
  })

  it('accepts null downloadPathId', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ downloadPathId: null }),
    })
    expect(res.status).toBe(200)
  })

  it('writes valid apiKey via setYoutubeApiKey', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)
    const apiKeySpy = vi.spyOn(Prefs, 'setYoutubeApiKey').mockImplementation(() => {})

    const validKey = 'AIzaSyDxxxxxxxxxxxxxxxxxxxxxx'
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: validKey }),
    })
    expect(res.status).toBe(200)
    expect(apiKeySpy).toHaveBeenCalledWith(validKey)
  })

  it('clears apiKey when sent as empty string', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)
    const apiKeySpy = vi.spyOn(Prefs, 'setYoutubeApiKey').mockImplementation(() => {})

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: '' }),
    })
    expect(res.status).toBe(200)
    expect(apiKeySpy).toHaveBeenCalledWith(null)
  })

  it('persists allowedRoles and forces admin to be present', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ allowedRoles: ['standard', 'guest'] }),
    })
    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({
      allowedRoles: ['admin', 'standard', 'guest'],
    }))
  })

  it('rejects non-array allowedRoles', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ allowedRoles: 'admin' }),
    })
    expect(res.status).toBe(422)
  })

  it('rejects unknown role in allowedRoles', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ allowedRoles: ['admin', 'wizard'] }),
    })
    expect(res.status).toBe(422)
  })

  it('rejects malformed apiKey', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)
    const apiKeySpy = vi.spyOn(Prefs, 'setYoutubeApiKey').mockImplementation(() => {})

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'short' }),
    })
    expect(res.status).toBe(422)
    expect(apiKeySpy).not.toHaveBeenCalled()
  })
})

describe('YouTube router — cookies', () => {
  it('writes cookies via setYoutubeCookies', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)
    const cookiesSpy = vi.spyOn(Prefs, 'setYoutubeCookies').mockImplementation(() => {})

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookies: '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1\tx\ty' }),
    })
    expect(res.status).toBe(200)
    expect(cookiesSpy).toHaveBeenCalledWith(expect.stringContaining('# Netscape'))
  })

  it('clears cookies when sent as empty string', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)
    const cookiesSpy = vi.spyOn(Prefs, 'setYoutubeCookies').mockImplementation(() => {})

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookies: '' }),
    })
    expect(res.status).toBe(200)
    expect(cookiesSpy).toHaveBeenCalledWith(null)
  })

  it('rejects oversize cookies (>256KB)', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const tooBig = 'x'.repeat(256 * 1024 + 1)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cookies: tooBig }),
    })
    expect(res.status).toBe(413)
  })
})

describe('YouTube router — env-locked apiKey', () => {
  it('reports isApiKeyFromEnv=true when env override active', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue('env-key')
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isApiKeyConfigured).toBe(true)
    expect(body.isApiKeyFromEnv).toBe(true)
  })

  it('PUT /config rejects apiKey writes when env-locked', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue('env-key')
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(true)
    vi.spyOn(Prefs, 'set').mockReturnValue(true)
    const apiKeySpy = vi.spyOn(Prefs, 'setYoutubeApiKey').mockImplementation(() => {})

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'AIzaSyDxxxxxxxxxxxxxxxxxxxxxx' }),
    })
    expect(res.status).toBe(409)
    expect(apiKeySpy).not.toHaveBeenCalled()
  })

  it('PUT /config still accepts non-apiKey fields when env-locked', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue('env-key')
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(true)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isEnabled: true }),
    })
    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({ isEnabled: true }))
  })
})

describe('YouTube router — GET /search', () => {
  it('returns 503 when youtube disabled', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/search?q=foo`)
    expect(res.status).toBe(503)
  })

  it('returns 422 when q missing', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/search`)
    expect(res.status).toBe(422)
  })

  it('returns 422 when q too long', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    const long = 'x'.repeat(201)
    const res = await fetch(`${baseUrl}/api/youtube/search?q=${long}`)
    expect(res.status).toBe(422)
  })

  it('returns search results when enabled', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    const items = [{
      videoId: 'abcdefghijk',
      title: 'A',
      channel: 'C',
      publishedAt: '',
      thumbnail: '',
      duration: 100,
      viewCount: 0,
      isKaraoke: false,
    }]
    const page: YoutubeSearchPage = { results: items, nextPageToken: null }
    vi.spyOn(YoutubeService, 'search').mockResolvedValue(page)

    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(page)
  })

  it('maps YoutubeApiError to its status', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    vi.spyOn(YoutubeService, 'search').mockRejectedValue(new YoutubeApiError('quota', 403))

    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(403)
  })

  it('returns 503 when API key missing (service throws)', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    vi.spyOn(YoutubeService, 'search').mockRejectedValue(new YoutubeApiError('no key', 503))

    const res = await fetch(`${baseUrl}/api/youtube/search?q=hello`)
    expect(res.status).toBe(503)
  })
})

describe('YouTube router — PUT /config musicbrainzMinScore', () => {
  it('rejects non-numeric musicbrainzMinScore', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ musicbrainzMinScore: 'high' }),
    })
    expect(res.status).toBe(422)
  })

  it('rejects out-of-range musicbrainzMinScore', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ musicbrainzMinScore: 150 }),
    })
    expect(res.status).toBe(422)
  })

  it('accepts musicbrainzMinScore=75', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    vi.spyOn(Prefs, 'getYoutubeApiKey').mockReturnValue(null)
    vi.spyOn(Prefs, 'isYoutubeApiKeyFromEnv').mockReturnValue(false)
    vi.spyOn(Prefs, 'getYoutubeCookies').mockReturnValue(null)
    const setSpy = vi.spyOn(Prefs, 'set').mockReturnValue(true)

    const res = await fetch(`${baseUrl}/api/youtube/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ musicbrainzMinScore: 75 }),
    })
    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledWith('youtube', expect.objectContaining({ musicbrainzMinScore: 75 }))
  })
})

describe('YouTube router — GET /identify', () => {
  it('returns 401 when userId null', async () => {
    currentUser = { userId: null, isAdmin: false, name: 'anon', roomId: null }
    const res = await fetch(`${baseUrl}/api/youtube/identify?title=foo`)
    expect(res.status).toBe(401)
  })

  it('returns 503 when YouTube disabled', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult() as any)
    const res = await fetch(`${baseUrl}/api/youtube/identify?title=foo`)
    expect(res.status).toBe(503)
  })

  it('returns 422 when title missing', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/identify`)
    expect(res.status).toBe(422)
  })

  it('returns found:true when MB score >= configured threshold', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, musicbrainzMinScore: 70 },
    }) as any)
    vi.spyOn(MB, 'searchByTitle').mockResolvedValue({ artist: 'A', title: 'T', score: 90 } as any)

    const res = await fetch(`${baseUrl}/api/youtube/identify?title=foo`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: true, artist: 'A', title: 'T', score: 90 })
  })

  it('returns found:false with topScore when below threshold', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, musicbrainzMinScore: 90 },
    }) as any)
    vi.spyOn(MB, 'searchByTitle').mockResolvedValue({ artist: 'A', title: 'T', score: 50 } as any)

    const res = await fetch(`${baseUrl}/api/youtube/identify?title=foo`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false, score: 50 })
  })

  it('returns found:false with score:null when MB returns null', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, musicbrainzMinScore: 70 },
    }) as any)
    vi.spyOn(MB, 'searchByTitle').mockResolvedValue(null)

    const res = await fetch(`${baseUrl}/api/youtube/identify?title=foo`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ found: false, score: null })
  })

  it('uses searchByArtistTitle when both artist and title provided', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, musicbrainzMinScore: 70 },
    }) as any)
    const byTitle = vi.spyOn(MB, 'searchByTitle').mockResolvedValue(null)
    const byArtistTitle = vi.spyOn(MB, 'searchByArtistTitle').mockResolvedValue({ artist: 'A', title: 'T', score: 95 } as any)

    const res = await fetch(`${baseUrl}/api/youtube/identify?title=foo&artist=bar`)
    expect(res.status).toBe(200)
    expect(byArtistTitle).toHaveBeenCalledWith('bar', 'foo')
    expect(byTitle).not.toHaveBeenCalled()
  })
})

describe('YouTube router — POST /download', () => {
  const validBody = { videoId: 'abcdefghijk', artist: 'Artist', title: 'Title' }

  it('returns 409 when ctx.user.roomId is null', async () => {
    currentUser = { userId: 1, isAdmin: true, name: 'admin', roomId: null }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(409)
  })

  it('returns 422 when artist missing', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoId: 'abcdefghijk', title: 'Title' }),
    })
    expect(res.status).toBe(422)
  })

  it('returns 422 when title missing', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ videoId: 'abcdefghijk', artist: 'Artist' }),
    })
    expect(res.status).toBe(422)
  })

  it('returns 422 when videoId invalid', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, videoId: 'bad!' }),
    })
    expect(res.status).toBe(422)
  })

  it('happy path: returns 202 and starts the job', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false, qualityPreset: '720p' },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/media', priority: 0, prefs: {} } } },
    }) as any)
    const fakeJob = { videoId: 'abcdefghijk', status: 'queued', progress: 0 }
    const startSpy = vi.spyOn(Downloader, 'start').mockResolvedValue(fakeJob as any)

    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual(fakeJob)
    expect(startSpy).toHaveBeenCalledWith('abcdefghijk', expect.objectContaining({
      destDir: '/media',
      pathId: 3,
      qualityPreset: '720p',
      artist: 'Artist',
      title: 'Title',
      roomId: 1,
      userId: 1,
    }))
  })

  it('rejects standard user when role not allowed', async () => {
    currentUser = { userId: 2, isAdmin: false, isGuest: false, name: 'standard', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false, allowedRoles: ['admin'] },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/a', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(403)
  })

  it('allows guest when role explicitly allowed', async () => {
    currentUser = { userId: 5, isAdmin: false, isGuest: true, name: 'guest-y', roomId: 2 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false, allowedRoles: ['admin', 'guest'] },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/media', priority: 0, prefs: {} } } },
    }) as any)
    const fakeJob = { videoId: 'abcdefghijk', status: 'queued', progress: 0 }
    vi.spyOn(Downloader, 'start').mockResolvedValue(fakeJob as any)

    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(202)
  })

  it('allows room_manager when role explicitly allowed', async () => {
    currentUser = { userId: 6, isAdmin: false, isGuest: false, role: 'room_manager', name: 'mgr', roomId: 2 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 3, useCookies: false, allowedRoles: ['admin', 'room_manager'] },
      paths: { result: [3], entities: { 3: { pathId: 3, path: '/media', priority: 0, prefs: {} } } },
    }) as any)
    const fakeJob = { videoId: 'abcdefghijk', status: 'queued', progress: 0 }
    vi.spyOn(Downloader, 'start').mockResolvedValue(fakeJob as any)

    const res = await fetch(`${baseUrl}/api/youtube/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    expect(res.status).toBe(202)
  })
})

describe('YouTube router — GET /access', () => {
  it('returns 401 when unauthenticated', async () => {
    currentUser = { userId: null, isAdmin: false, isGuest: false, name: 'anon', roomId: null }
    const res = await fetch(`${baseUrl}/api/youtube/access`)
    expect(res.status).toBe(401)
  })

  it('returns hasAccess=true for admin even when allowedRoles excludes others', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: 7, useCookies: false, allowedRoles: ['admin'] },
      paths: { result: [7], entities: { 7: { pathId: 7, path: '/x', priority: 0, prefs: {} } } },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/access`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isEnabled: true,
      hasAccess: true,
      downloadPathConfigured: true,
      musicbrainzMinScore: 80,
    })
  })

  it('returns hasAccess=false for standard user when not allowed', async () => {
    currentUser = { userId: 2, isAdmin: false, isGuest: false, name: 'standard', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin'] },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/access`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isEnabled: true,
      hasAccess: false,
      downloadPathConfigured: false,
      musicbrainzMinScore: 80,
    })
  })

  it('returns hasAccess=true for room_manager when role allowed', async () => {
    currentUser = { userId: 8, isAdmin: false, isGuest: false, role: 'room_manager', name: 'mgr', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'room_manager'] },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/access`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasAccess).toBe(true)
    expect(body.isEnabled).toBe(true)
  })

  it('returns hasAccess=true for guest when guest role allowed', async () => {
    currentUser = { userId: 4, isAdmin: false, isGuest: true, name: 'guest-z', roomId: 1 }
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: true, downloadPathId: null, useCookies: false, allowedRoles: ['admin', 'guest'] },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/access`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.hasAccess).toBe(true)
    expect(body.isEnabled).toBe(true)
  })

  it('returns hasAccess=false when YouTube disabled (even for admin)', async () => {
    vi.spyOn(Prefs, 'get').mockReturnValue(buildPrefsResult({
      youtube: { isEnabled: false, downloadPathId: null, useCookies: false, allowedRoles: ['admin'] },
    }) as any)
    const res = await fetch(`${baseUrl}/api/youtube/access`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.isEnabled).toBe(false)
    expect(body.hasAccess).toBe(false)
  })
})
