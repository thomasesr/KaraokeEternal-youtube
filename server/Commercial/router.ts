import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import * as Commercial from './Commercial.js'

const log = getLogger('Commercial')
const router = new KoaRouter({ prefix: '/api/commercial' })
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

const moveFile = (src: string, dest: string): void => {
  try {
    fs.renameSync(src, dest)
  } catch (err: any) {
    if (err.code === 'EXDEV') {
      fs.copyFileSync(src, dest)
      fs.unlinkSync(src)
    } else {
      throw err
    }
  }
}

// GET /api/commercial/status?roomId=X
router.get('/status', (ctx) => {
  if (!ctx.user.isAdmin && ctx.user.role !== 'room_manager') {
    ctx.throw(403, 'Forbidden')
  }

  const roomId = ctx.query.roomId ? parseInt(ctx.query.roomId as string, 10) : null

  ctx.body = {
    hasGlobal: Commercial.hasGlobal(),
    hasRoomOverride: roomId && !isNaN(roomId) ? Commercial.hasRoomOverride(roomId) : false,
  }
})

// GET /api/commercial?roomId=X — stream video (room override > global)
router.get('/', (ctx) => {
  const roomId = ctx.query.roomId ? parseInt(ctx.query.roomId as string, 10) : null
  const filePath = Commercial.resolveFilePath(roomId && !isNaN(roomId) ? roomId : null)

  if (!filePath) {
    ctx.throw(404, 'No commercial video available')
    return
  }

  const stat = fs.statSync(filePath)
  ctx.set('Content-Type', 'video/mp4')
  ctx.set('Content-Length', String(stat.size))
  ctx.set('Accept-Ranges', 'bytes')
  ctx.body = fs.createReadStream(filePath)
})

// POST /api/commercial — upload MP4 (admin = global, room_manager = room override)
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

  const file = Array.isArray(uploaded) ? uploaded[0] : uploaded
  const ext = path.extname(file.originalFilename ?? '').toLowerCase()

  if (ext !== '.mp4') {
    await unlink(file.filepath).catch(() => null)
    ctx.throw(422, 'Only .mp4 files accepted')
  }

  let destPath: string

  if (isRoomManager) {
    const roomId = parseInt(String(req.body.roomId), 10)
    if (isNaN(roomId)) {
      await unlink(file.filepath).catch(() => null)
      ctx.throw(422, 'roomId required for room manager upload')
    }
    destPath = Commercial.roomFilePath(roomId)
  } else {
    destPath = Commercial.globalFilePath()
  }

  await Commercial.ensureDir(destPath)
  moveFile(file.filepath, destPath)
  log.info('Commercial video saved to %s', destPath)

  ctx.body = { ok: true }
})

// DELETE /api/commercial?roomId=X — remove file
router.delete('/', async (ctx) => {
  const isRoomManager = ctx.user.role === 'room_manager'

  if (!ctx.user.isAdmin && !isRoomManager) {
    ctx.throw(403, 'Forbidden')
  }

  if (isRoomManager) {
    const roomId = ctx.query.roomId ? parseInt(ctx.query.roomId as string, 10) : NaN
    if (isNaN(roomId)) ctx.throw(422, 'roomId required')
    await Commercial.deleteFile(Commercial.roomFilePath(roomId))
    log.info('Room commercial override deleted (roomId: %s)', roomId)
  } else {
    await Commercial.deleteFile(Commercial.globalFilePath())
    log.info('Global commercial deleted')
  }

  ctx.body = { ok: true }
})

export default router
