import { db } from '../lib/Database.js'
import sql from 'sqlate'
import getLogger from '../lib/Log.js'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

function findPackageJson (startDir: string): string {
  let dir = startDir
  const root = path.parse(dir).root
  while (dir !== root) {
    const candidate = path.join(dir, 'package.json')
    if (fs.existsSync(candidate)) return candidate
    dir = path.dirname(dir)
  }
  throw new Error('package.json not found')
}

const pkg = (() => {
  try {
    const pkgPath = findPackageJson(path.dirname(fileURLToPath(import.meta.url)))
    return createRequire(import.meta.url)(pkgPath) as { version: string }
  } catch {
    return { version: '0.0.0' }
  }
})()

const log = getLogger('MusicBrainz')

const FALLBACK_EMAIL = 'contato@thomasesr.com'
const RATE_LIMIT_MS = 1100
const REQUEST_TIMEOUT_MS = 8000

let cachedEmail: string | null = null
let queue: Promise<unknown> = Promise.resolve()

export function resolveAdminEmail (): string {
  if (cachedEmail) return cachedEmail
  try {
    const query = sql`
      SELECT username FROM users
      WHERE isAdmin = 1 AND username LIKE '%@%'
      ORDER BY userId ASC
      LIMIT 1
    `
    const row = db.get<{ username: string }>(String(query), query.parameters)
    cachedEmail = row?.username ?? FALLBACK_EMAIL
  } catch (e) {
    log.warn('admin email lookup failed: %s', (e as Error).message)
    cachedEmail = FALLBACK_EMAIL
  }
  return cachedEmail
}

export function _resetEmailCacheForTest (): void {
  cachedEmail = null
}

export function userAgent (): string {
  return `KaraokeEternal/${pkg.version} ( ${resolveAdminEmail()} )`
}

const STRIP_TOKENS = [
  'karaoke', 'voiceless', 'vocal', 'vocals', 'instrumental',
  'lyrics', 'lyric', 'official', 'video', 'audio',
  'hd', 'hq', '4k', '1080p', '720p',
  'music video', 'official video', 'official audio',
  'with lyrics', 'sing along', 'singalong',
]

export function cleanTitle (raw: string): string {
  let s = raw

  s = s.replace(/[([{][^([{)\]}]*[)\]}]/g, (m) => {
    const inner = m.slice(1, -1).toLowerCase()
    return STRIP_TOKENS.some(t => inner.includes(t)) ? ' ' : m
  })

  for (const t of STRIP_TOKENS) {
    const re = new RegExp(`(^|[\\s\\-|·])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[\\s\\-|·])`, 'gi')
    s = s.replace(re, ' ')
  }

  s = s.replace(/\s*[-|·]\s*Topic\s*$/i, '')
  s = s.replace(/[([{]\s*[)\]}]/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^[-|·,\s]+|[-|·,\s]+$/g, '')

  return s
}

export interface MusicBrainzHit {
  artist: string
  title: string
  score: number
}

interface MbRecording {
  title?: string
  score?: number
  'artist-credit'?: { name?: string, artist?: { name?: string } }[]
}

interface MbResponse {
  recordings?: MbRecording[]
}

function rateLimited<T> (fn: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    const start = Date.now()
    try {
      return await fn()
    } finally {
      const elapsed = Date.now() - start
      const wait = RATE_LIMIT_MS - elapsed
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
    }
  })
  queue = next.catch(() => undefined)
  return next
}

export async function searchRecording (query: string): Promise<MusicBrainzHit | null> {
  const q = query.trim()
  if (!q) return null

  return rateLimited(async () => {
    const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(q)}&fmt=json&limit=5`
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': userAgent(), 'Accept': 'application/json' },
        signal: ctrl.signal,
      })
    } catch (e) {
      log.warn('MusicBrainz fetch failed: %s', (e as Error).message)
      return null
    } finally {
      clearTimeout(timer)
    }

    if (!res.ok) {
      log.warn('MusicBrainz HTTP %d for query %s', res.status, q)
      return null
    }

    let body: MbResponse
    try {
      body = await res.json() as MbResponse
    } catch (e) {
      log.warn('MusicBrainz JSON parse failed: %s', (e as Error).message)
      return null
    }

    const recs = body.recordings ?? []
    if (recs.length === 0) return null

    const top = recs[0]
    const artist = top['artist-credit']?.[0]?.name ?? top['artist-credit']?.[0]?.artist?.name ?? ''
    const title = top.title ?? ''
    const score = typeof top.score === 'number' ? top.score : 0
    if (!artist || !title) return null
    return { artist, title, score }
  })
}

export async function searchByTitle (rawTitle: string): Promise<MusicBrainzHit | null> {
  return searchRecording(cleanTitle(rawTitle))
}

export async function searchByArtistTitle (artist: string, title: string): Promise<MusicBrainzHit | null> {
  const a = artist.trim()
  const t = title.trim()
  if (!a || !t) return null
  const q = `recording:"${t.replace(/"/g, '\\"')}" AND artist:"${a.replace(/"/g, '\\"')}"`
  return searchRecording(q)
}
