import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import KoaRouter from '@koa/router'
import { unzip } from 'unzipit'
import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import pushQueuesAndLibrary from '../lib/pushQueuesAndLibrary.js'
import Library from '../Library/Library.js'

const log = getLogger('Upload')
const router = new KoaRouter({ prefix: '/api/upload' })
const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)
const unlink = promisify(fs.unlink)

interface UploadFile {
  filepath: string
  originalFilename?: string
  size: number
}

interface RequestWithBody {
  body: Record<string, unknown>
  files?: Record<string, UploadFile | UploadFile[]>
}

const getManagedPath = (userId: number): { pathId: number; path: string } | null => {
  const query = sql`SELECT pathId, path FROM paths WHERE managedByUserId = ${userId} LIMIT 1`
  return db.get<{ pathId: number; path: string }>(String(query), query.parameters) ?? null
}

const detectZipType = (names: string[]): 'mp3+cdg' | 'mp3+lrc' | 'mp4' | 'audio-only' | 'mixed' => {
  const exts = new Set(names.map(n => path.extname(n).toLowerCase()))
  if (exts.has('.cdg')) return 'mp3+cdg'
  if (exts.has('.lrc')) return 'mp3+lrc'
  if (exts.has('.mp4')) return 'mp4'
  if (exts.has('.mp3') || exts.has('.flac') || exts.has('.wav') || exts.has('.m4a')) return 'audio-only'
  return 'mixed'
}

const moveFile = async (src: string, dest: string) => {
  try {
    fs.renameSync(src, dest)
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest)
      await unlink(src).catch(() => null)
    } else {
      throw err
    }
  }
}

// POST /api/upload — upload one or more media files (or ZIPs) in a single request
router.post('/', async (ctx) => {
  const isRoomManager = ctx.user.role === 'room_manager'

  if (!ctx.user.isAdmin && !isRoomManager) {
    ctx.throw(403, 'Forbidden')
  }

  const req = ctx.request as unknown as RequestWithBody
  const uploaded = req.files?.file

  if (!uploaded) {
    ctx.throw(422, 'No file uploaded')
  }

  const files: UploadFile[] = Array.isArray(uploaded) ? uploaded : [uploaded]

  // resolve destination path
  let destDir: string
  let pathId: number

  if (isRoomManager) {
    const managed = getManagedPath(ctx.user.userId)

    if (!managed) {
      await Promise.all(files.map(f => unlink(f.filepath).catch(() => null)))
      ctx.throw(403, 'No managed folder assigned to your account')
    }

    destDir = managed.path
    pathId = managed.pathId
  } else {
    pathId = parseInt(String(req.body.pathId), 10)

    if (isNaN(pathId)) {
      await Promise.all(files.map(f => unlink(f.filepath).catch(() => null)))
      ctx.throw(422, 'pathId required')
    }

    const row = db.get<{ path: string }>(
      String(sql`SELECT path FROM paths WHERE pathId = ${pathId}`),
      sql`SELECT path FROM paths WHERE pathId = ${pathId}`.parameters,
    )

    if (!row) {
      await Promise.all(files.map(f => unlink(f.filepath).catch(() => null)))
      ctx.throw(404, 'Path not found')
    }

    destDir = row.path
  }

  await mkdir(destDir, { recursive: true })

  let totalExtracted = 0
  const zipTypes: string[] = []

  for (const file of files) {
    const originalName = file.originalFilename ?? 'upload'
    const ext = path.extname(originalName).toLowerCase()

    if (ext === '.zip') {
      const data = fs.readFileSync(file.filepath)
      const { entries } = await unzip(data)
      const names = Object.keys(entries)
      const zipType = detectZipType(names)
      zipTypes.push(zipType)

      for (const [name, entry] of Object.entries(entries)) {
        const safe = path.basename(name)
        if (!safe || safe.startsWith('.')) continue
        await writeFile(path.join(destDir, safe), Buffer.from(await entry.arrayBuffer()))
        totalExtracted++
      }

      await unlink(file.filepath)
      log.info('ZIP upload (%s): %d files extracted to %s', zipType, totalExtracted, destDir)
    } else {
      await moveFile(file.filepath, path.join(destDir, path.basename(originalName)))
      totalExtracted++
      log.info('File upload: %s -> %s', originalName, destDir)
    }
  }

  // all files landed — invalidate cache and scan once
  Library.cache.version = null
  ctx.startScanner(pathId)
  pushQueuesAndLibrary(ctx.io)

  ctx.body = {
    ok: true,
    zipTypes: zipTypes.length ? zipTypes : null,
    extractedCount: totalExtracted,
  }
})

export default router
