import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import env from '../lib/cli.js'

const mkdir = promisify(fs.mkdir)
const unlink = promisify(fs.unlink)

const BASE_DIR = path.join(env.KES_PATH_DATA, 'commercials')

export const globalFilePath = (): string => path.join(BASE_DIR, 'global', 'commercial.mp4')
export const roomFilePath = (roomId: number): string => path.join(BASE_DIR, 'rooms', String(roomId), 'commercial.mp4')

export const hasGlobal = (): boolean => fs.existsSync(globalFilePath())
export const hasRoomOverride = (roomId: number): boolean => fs.existsSync(roomFilePath(roomId))

export const ensureDir = async (filePath: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true })
}

export const deleteFile = async (filePath: string): Promise<void> => {
  await unlink(filePath).catch(() => null)
}

export const resolveFilePath = (roomId: number | null): string | null => {
  if (roomId !== null && hasRoomOverride(roomId)) return roomFilePath(roomId)
  if (hasGlobal()) return globalFilePath()
  return null
}
