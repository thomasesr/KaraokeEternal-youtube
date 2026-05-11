import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const fakeDb = { get: vi.fn(), run: vi.fn(), all: vi.fn(), exec: vi.fn() }

vi.mock('../../lib/Database.js', () => ({
  db: fakeDb,
  default: { refs: { db: fakeDb } },
  open: vi.fn(),
  close: vi.fn(),
  DatabaseWrapper: class {},
}))

const { default: Prefs } = await import('../Prefs.js')

describe('Prefs.getYoutubeApiKey — env precedence', () => {
  const origEnv = process.env.KES_YOUTUBE_API_KEY

  beforeEach(() => {
    delete process.env.KES_YOUTUBE_API_KEY
    fakeDb.get.mockReset()
    fakeDb.run.mockReset()
  })

  afterEach(() => {
    if (typeof origEnv === 'undefined') delete process.env.KES_YOUTUBE_API_KEY
    else process.env.KES_YOUTUBE_API_KEY = origEnv
  })

  it('returns env value and skips DB when env var set', () => {
    process.env.KES_YOUTUBE_API_KEY = '  env-key-value  '

    expect(Prefs.getYoutubeApiKey()).toBe('env-key-value')
    expect(fakeDb.get).not.toHaveBeenCalled()
    expect(Prefs.isYoutubeApiKeyFromEnv()).toBe(true)
  })

  it('falls back to DB when env var missing', () => {
    fakeDb.get.mockReturnValue({ data: JSON.stringify('db-key') })

    expect(Prefs.getYoutubeApiKey()).toBe('db-key')
    expect(fakeDb.get).toHaveBeenCalledTimes(1)
    expect(Prefs.isYoutubeApiKeyFromEnv()).toBe(false)
  })

  it('falls back to DB when env var is whitespace', () => {
    process.env.KES_YOUTUBE_API_KEY = '   '
    fakeDb.get.mockReturnValue(undefined)

    expect(Prefs.getYoutubeApiKey()).toBeNull()
    expect(fakeDb.get).toHaveBeenCalledTimes(1)
    expect(Prefs.isYoutubeApiKeyFromEnv()).toBe(false)
  })

  it('returns null when neither env nor DB has a value', () => {
    fakeDb.get.mockReturnValue(undefined)
    expect(Prefs.getYoutubeApiKey()).toBeNull()
  })
})
