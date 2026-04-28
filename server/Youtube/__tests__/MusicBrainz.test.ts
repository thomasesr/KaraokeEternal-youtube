/*
 * Characterization tests for the MusicBrainz utility module.
 *
 * Covers:
 *   - cleanTitle(): YouTube-title noise stripping (karaoke/lyrics/topic/etc.)
 *   - userAgent(): builds the MusicBrainz-compliant UA string from the admin email
 *     in the users table, with a fallback when lookup is empty or throws.
 *   - searchRecording(): network behavior — empty query, success, empty results,
 *     HTTP errors, fetch rejections, and missing artist-credit shapes.
 *
 * The DB is touched only via `db.get`, which is spied per-test. Global `fetch`
 * is stubbed via `vi.stubGlobal`. The cached email inside the module is reset
 * before each UA test using the exported test-only helper.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The MusicBrainz module reads admin email via `db.get()` from `../../lib/Database.js`.
// In a unit-test environment the live DB is not opened, so the exported `db` binding
// would be undefined. We replace the module with a stub object whose `get` method
// each test can rewire via vi.mocked(...).mockReturnValue / mockImplementation.
vi.mock('../../lib/Database.js', () => ({
  db: { get: vi.fn() },
}))

import {
  cleanTitle,
  userAgent,
  searchRecording,
  _resetEmailCacheForTest,
} from '../MusicBrainz.js'
import { db } from '../../lib/Database.js'

describe('MusicBrainz.cleanTitle', () => {
  it('strips (Karaoke Version) suffix', () => {
    expect(cleanTitle('Black Sabbath - Paranoid (Karaoke Version)'))
      .toBe('Black Sabbath - Paranoid')
  })

  it('strips [Karaoke] bracket suffix', () => {
    expect(cleanTitle('Song Name [Karaoke]')).toBe('Song Name')
  })

  it('strips trailing - Karaoke token', () => {
    const out = cleanTitle('Foo - Karaoke')
    expect(out).toMatch(/Foo/)
    expect(out).not.toMatch(/Karaoke/i)
  })

  it('strips (Official Video) and trailing -Topic suffix', () => {
    // current implementation only strips "- Topic" when at end of string;
    // an embedded "- Topic -" mid-string is left alone, but (Official Video) is removed.
    const out = cleanTitle('Some Channel - Topic - My Song (Official Video)')
    expect(out).toMatch(/My Song/)
    expect(out).not.toMatch(/Official/i)
  })

  it('strips trailing - Topic suffix on its own', () => {
    const out = cleanTitle('Artist - Topic')
    expect(out).toMatch(/Artist/)
    expect(out).not.toMatch(/Topic/i)
  })

  it('strips (Lyrics) parenthetical', () => {
    const out = cleanTitle('Title With (Lyrics) and stuff')
    expect(out).not.toMatch(/Lyrics/i)
    expect(out).toMatch(/Title With/)
    expect(out).toMatch(/and stuff/)
  })

  it('strips (HD), (HQ), (Audio) parentheticals', () => {
    expect(cleanTitle('Foo (HD) (HQ) (Audio)')).toBe('Foo')
  })

  it('collapses multiple spaces and trims dashes/whitespace edges', () => {
    expect(cleanTitle('   Foo    Bar   ')).toBe('Foo Bar')
    expect(cleanTitle('--- Foo Bar ---')).toBe('Foo Bar')
  })
})

describe('MusicBrainz.userAgent', () => {
  beforeEach(() => {
    _resetEmailCacheForTest()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    _resetEmailCacheForTest()
  })

  it('uses admin email from users table when available', () => {
    vi.mocked(db.get).mockReturnValue({ username: 'admin@example.com' })
    expect(userAgent()).toMatch(/^KaraokeEternal\/.+\( admin@example\.com \)$/)
  })

  it('falls back to default email when no admin row found', () => {
    vi.mocked(db.get).mockReturnValue(undefined)
    expect(userAgent()).toContain('contato@thomasesr.com')
  })

  it('falls back to default email when DB throws', () => {
    vi.mocked(db.get).mockImplementation(() => {
      throw new Error('db down')
    })
    expect(userAgent()).toContain('contato@thomasesr.com')
  })
})

describe('MusicBrainz.searchRecording', () => {
  beforeEach(() => {
    _resetEmailCacheForTest()
    // Pre-populate admin email cache so userAgent() doesn't hit the DB during fetch tests.
    vi.mocked(db.get).mockReturnValue({ username: 'admin@example.com' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    _resetEmailCacheForTest()
  })

  it('returns null on empty query without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await searchRecording('')).toBeNull()
    expect(await searchRecording('   ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends User-Agent header containing KaraokeEternal/', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ recordings: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await searchRecording('paranoid')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['User-Agent']).toMatch(/KaraokeEternal\//)
  })

  it('parses a top recording into {artist, title, score}', async () => {
    const payload = {
      recordings: [
        { title: 'Paranoid', score: 95, 'artist-credit': [{ name: 'Black Sabbath' }] },
      ],
    }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })))

    expect(await searchRecording('paranoid')).toEqual({
      artist: 'Black Sabbath',
      title: 'Paranoid',
      score: 95,
    })
  })

  it('returns null when recordings array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ recordings: [] }), { status: 200 })))
    expect(await searchRecording('nothing here')).toBeNull()
  })

  it('returns null on HTTP 503 (does not throw)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })))
    await expect(searchRecording('foo')).resolves.toBeNull()
  })

  it('returns null when fetch rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET') }))
    await expect(searchRecording('foo')).resolves.toBeNull()
  })

  it('returns null when recording has no artist-credit', async () => {
    const payload = { recordings: [{ title: 'Paranoid', score: 95 }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })))
    expect(await searchRecording('paranoid')).toBeNull()
  })
})
