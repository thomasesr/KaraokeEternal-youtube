import { promises as fsp } from 'fs'
import path from 'path'

const ILLEGAL_RE = /[\\/:*?"<>|\x00-\x1f]/g
const TRAILING_DOTS_SPACES_RE = /[. ]+$/
const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_LEN = 200

export function sanitizeComponent (s: string): string {
  let out = s.replace(ILLEGAL_RE, ' ').replace(/\s+/g, ' ').trim()
  if (RESERVED_WIN.test(out)) out = `_${out}`
  out = out.replace(TRAILING_DOTS_SPACES_RE, '')
  while (Buffer.byteLength(out, 'utf8') > MAX_LEN) out = out.slice(0, -1)
  return out || 'untitled'
}

export function buildFilenameBase (artist: string, title: string): string {
  return `${sanitizeComponent(artist)} - ${sanitizeComponent(title)}`
}

export async function pickUniqueBase (destDir: string, base: string): Promise<string> {
  let entries: string[]
  try {
    entries = await fsp.readdir(destDir)
  } catch {
    return base
  }

  const exists = (candidate: string): boolean =>
    entries.some(e => e === candidate || e.startsWith(`${candidate}.`))

  if (!exists(base)) return base

  for (let i = 1; i < 1000; i++) {
    const candidate = `${base} - yt${i}`
    if (!exists(candidate)) return candidate
  }
  throw new Error('Could not find unique filename after 1000 attempts')
}

export function relPathFrom (destDir: string, absPath: string): string {
  return path.relative(destDir, absPath)
}
