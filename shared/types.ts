export interface Artist {
  artistId: number
  name: string
  songIds: number[]
}

export interface Song {
  artistId: number
  duration: number
  songId: number
  title: string
  numMedia: number
}

export interface QueueItem {
  queueId: number
  songId: number
  userId: number
  prevQueueId: number
  mediaId: number
  rgTrackGain: number
  rgTrackPeak: number
  userDateUpdated: number
  userDisplayName: string
  mediaType: 'cdg' | 'lrc' | 'mp4'
  isOptimistic?: false
  isVideoKeyingEnabled: boolean
}

export interface OptimisticQueueItem {
  isOptimistic: true
  prevQueueId: number
  queueId: number
  songId: number
}

export interface IRoomPrefs {
  qr: {
    isEnabled: boolean
    opacity: number
    password: string
    size: number
  }
  user?: {
    isNewAllowed?: boolean
    isGuestAllowed?: boolean
  }
  roles?: Record<number, {
    allowNew: boolean
  }>
}

export interface Room {
  roomId: number
  name: string
  status: 'open' | 'closed'
  dateCreated: number
  hasPassword: boolean
  numUsers: number
  prefs?: IRoomPrefs
  managers?: number[]
}

export interface Role {
  roleId: number
  name: string
}

export interface Path {
  pathId: number
  path: string
  priority: number
  prefs: {
    isVideoKeyingEnabled: boolean
    isWatchingEnabled: boolean
  }
}

export interface User {
  userId: number
  username: string
  name: string
  isAdmin: boolean // todo: client and server ctx only
  isGuest: boolean // todo: client and server ctx only
  dateCreated: number
  dateUpdated: number
}

export interface UserWithRole extends User {
  role?: string
}

export interface PlaybackOptions {
  cdgAlpha?: number
  cdgSize?: number
  mp4Alpha?: number
  visualizer?: {
    sensitivity?: number
    isEnabled?: boolean
    nextPreset?: boolean
    prevPreset?: boolean
    randomPreset?: boolean
  }
}

export type MediaType = 'cdg' | 'lrc' | 'mp4' | ''

export interface Media {
  songId: number
  mediaId: number
  isPreferred: boolean
  path: string
  relPath: string
  duration: number
}

export type YoutubeQualityPreset = 'best' | '1080p' | '720p' | '480p' | '360p'

export const YOUTUBE_QUALITY_PRESETS: YoutubeQualityPreset[] = ['best', '1080p', '720p', '480p', '360p']

export type YoutubeRole = 'admin' | 'room_manager' | 'standard' | 'guest'

export const YOUTUBE_ROLES: YoutubeRole[] = ['admin', 'room_manager', 'standard', 'guest']

export interface IYoutubePrefs {
  isEnabled: boolean
  downloadPathId: number | null
  useCookies: boolean
  qualityPreset: YoutubeQualityPreset
  musicbrainzMinScore: number
  allowedRoles: YoutubeRole[]
  isApiKeyConfigured: boolean
  isApiKeyFromEnv: boolean
  isCookiesConfigured: boolean
}

export interface IYoutubeAccess {
  isEnabled: boolean
  hasAccess: boolean
  downloadPathConfigured: boolean
  musicbrainzMinScore: number
}

export interface Prefs {
  isFirstRun?: boolean
  isScanning: boolean
  isReplayGainEnabled: boolean
  youtube?: IYoutubePrefs
  paths: {
    result: number[]
    entities: Record<number, Path>
  }
  roles: {
    result: number[]
    entities: Record<number, Role>
  }
  [key: string]: unknown
}
