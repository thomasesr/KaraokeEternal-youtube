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
  parseTitleParts,
  searchByTitle,
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

  it('strips all-caps bracket tags like [UVR], [MV]', () => {
    expect(cleanTitle('Led Zeppelin • Ramble On [UVR]')).toBe('Led Zeppelin • Ramble On')
    expect(cleanTitle('Song Title [MV]')).toBe('Song Title')
  })

  it('strips [UVR] and karaoke bracket together', () => {
    expect(cleanTitle('Led Zeppelin • Ramble On (CC Karaoke / Instrumental) [UVR]'))
      .toBe('Led Zeppelin • Ramble On')
  })
})

describe('MusicBrainz.parseTitleParts', () => {
  it('splits "Artist - Title" with ASCII hyphen', () => {
    expect(parseTitleParts('Black Sabbath - Paranoid'))
      .toEqual({ artist: 'Black Sabbath', title: 'Paranoid' })
  })

  it('splits "Artist – Title" with en-dash', () => {
    expect(parseTitleParts('Adele – Hello'))
      .toEqual({ artist: 'Adele', title: 'Hello' })
  })

  it('splits "Artist — Title" with em-dash', () => {
    expect(parseTitleParts('Queen — Bohemian Rhapsody'))
      .toEqual({ artist: 'Queen', title: 'Bohemian Rhapsody' })
  })

  it('splits "Artist | Title" with pipe', () => {
    expect(parseTitleParts('Coldplay | Yellow'))
      .toEqual({ artist: 'Coldplay', title: 'Yellow' })
  })

  it('splits "Artist: Title" with colon', () => {
    expect(parseTitleParts('Bowie: Heroes'))
      .toEqual({ artist: 'Bowie', title: 'Heroes' })
  })

  it('splits at the first separator only (rest stays in title)', () => {
    expect(parseTitleParts('Pink Floyd - Comfortably Numb - Pulse'))
      .toEqual({ artist: 'Pink Floyd', title: 'Comfortably Numb - Pulse' })
  })

  it('returns null when no separator is found', () => {
    expect(parseTitleParts('Just A Title')).toBeNull()
  })

  it('returns null on empty input', () => {
    expect(parseTitleParts('')).toBeNull()
    expect(parseTitleParts('   ')).toBeNull()
  })

  it('does not split on hyphen without surrounding spaces', () => {
    expect(parseTitleParts('Twenty-One Pilots')).toBeNull()
  })

  it('splits "Artist • Title" with bullet (U+2022)', () => {
    expect(parseTitleParts('Led Zeppelin • Ramble On'))
      .toEqual({ artist: 'Led Zeppelin', title: 'Ramble On' })
  })
})

describe('MusicBrainz.searchByTitle', () => {
  beforeEach(() => {
    _resetEmailCacheForTest()
    vi.mocked(db.get).mockReturnValue({ username: 'admin@example.com' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    _resetEmailCacheForTest()
  })

  it('issues a structured artist+title query when the title splits', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ recordings: [{ 'title': 'Paranoid', 'score': 100, 'artist-credit': [{ name: 'Black Sabbath' }] }] }),
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const hit = await searchByTitle('Black Sabbath - Paranoid (Karaoke Version)')
    expect(hit).toEqual({ artist: 'Black Sabbath', title: 'Paranoid', score: 100 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = (fetchMock.mock.calls[0] as unknown[])[0] as string
    expect(url).toContain('recording')
    expect(url).toContain('artist')
    expect(url).toContain(encodeURIComponent('Black Sabbath'))
    expect(url).toContain(encodeURIComponent('Paranoid'))
  })

  it('correctly identifies "Led Zeppelin • Ramble On (CC Karaoke / Instrumental) [UVR]"', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ recordings: [{ 'title': 'Ramble On', 'score': 100, 'artist-credit': [{ name: 'Led Zeppelin' }] }] }),
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const hit = await searchByTitle('Led Zeppelin • Ramble On (CC Karaoke / Instrumental) [UVR]')
    expect(hit).toEqual({ artist: 'Led Zeppelin', title: 'Ramble On', score: 100 })

    // Must use structured query (not free-text fallback)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = (fetchMock.mock.calls[0] as unknown[])[0] as string
    expect(url).toContain(encodeURIComponent('Led Zeppelin'))
    expect(url).toContain(encodeURIComponent('Ramble On'))
    expect(url).toContain('recording%3A')
    expect(url).toContain('artist%3A')
  })

  it('falls back to a free-text query when no separator is present', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ recordings: [{ 'title': 'Foo', 'score': 70, 'artist-credit': [{ name: 'Bar' }] }] }),
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const hit = await searchByTitle('No Separator Here')
    expect(hit).toEqual({ artist: 'Bar', title: 'Foo', score: 70 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = (fetchMock.mock.calls[0] as unknown[])[0] as string
    // free-text fallback does not embed the structured field syntax
    expect(url).not.toContain('recording%3A')
    expect(url).not.toContain('artist%3A')
  })

  it('tries reversed orientation when structured scores below CONFIDENT_SCORE and returns best', async () => {
    // "Ramble On - Led Zeppelin" — title and artist are swapped.
    // structured: recording:"Led Zeppelin" AND artist:"Ramble On" → low score
    // reversed:   recording:"Ramble On" AND artist:"Led Zeppelin" → high score
    let call = 0
    const fetchMock = vi.fn(async () => {
      call++
      if (call === 1) {
        // structured query returns a low-confidence hit
        return new Response(
          JSON.stringify({ recordings: [{ 'title': 'Led Zeppelin', 'score': 35, 'artist-credit': [{ name: 'Some Cover Band' }] }] }),
          { status: 200 },
        )
      }
      // reversed query returns the correct high-confidence hit
      return new Response(
        JSON.stringify({ recordings: [{ 'title': 'Ramble On', 'score': 97, 'artist-credit': [{ name: 'Led Zeppelin' }] }] }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const hit = await searchByTitle('Ramble On - Led Zeppelin (Karaoke)')
    expect(hit).toEqual({ artist: 'Led Zeppelin', title: 'Ramble On', score: 97 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('continues to fallback free-text when both structured and reversed score low', async () => {
    let call = 0
    const fetchMock = vi.fn(async () => {
      call++
      const score = call <= 2 ? 20 : 85
      const artist = call <= 2 ? 'Wrong Artist' : 'Right Artist'
      const title = call <= 2 ? 'Wrong Title' : 'Right Title'
      return new Response(
        JSON.stringify({ recordings: [{ title, score, 'artist-credit': [{ name: artist }] }] }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const hit = await searchByTitle('Something - Else (Karaoke)')
    expect(hit).toEqual({ artist: 'Right Artist', title: 'Right Title', score: 85 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
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
        { 'title': 'Paranoid', 'score': 95, 'artist-credit': [{ name: 'Black Sabbath' }] },
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
