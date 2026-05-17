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
  managedByUserId?: number | null
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
    simpleQr?: boolean
  }
  user?: {
    isNewAllowed?: boolean
    isGuestAllowed?: boolean
  }
  roles?: Record<number, {
    allowNew: boolean
  }>
  notifyEnabled?: boolean
  notifyLeadSeconds?: number
  autoplay?: {
    isEnabled?: boolean
  }
  scoring?: {
    isEnabled?: boolean
    duration?: number
  }
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
  managedByUserId?: number | null
  prefs: {
    isAudioOnlyEnabled: boolean
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
  lrcFontSize?: number
  lrcOffset?: number
  lrcSmoothScroll?: boolean
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
  /** Admin-set global default for this song group */
  isPreferred: boolean
  /** Room manager-set default for the requesting user's current room */
  roomPreferred?: boolean
  /** This user's personal version choice */
  userPreferred?: boolean
  path: string
  relPath: string
  duration: number
}

export type YoutubeQualityPreset = 'best' | '1080p' | '720p' | '480p' | '360p'

export const YOUTUBE_QUALITY_PRESETS: YoutubeQualityPreset[] = ['best', '1080p', '720p', '480p', '360p']

export type YoutubeRole = 'admin' | 'room_manager' | 'standard' | 'guest'

export const YOUTUBE_ROLES: YoutubeRole[] = ['admin', 'room_manager', 'standard', 'guest']

export type YoutubeEnhancedLrcBackend = 'none' | 'ctc'

export const YOUTUBE_ENHANCED_LRC_BACKENDS: YoutubeEnhancedLrcBackend[] = ['none', 'ctc']

export interface IYoutubePrefs {
  isEnabled: boolean
  downloadPathId: number | null
  useCookies: boolean
  qualityPreset: YoutubeQualityPreset
  musicbrainzMinScore: number
  allowedRoles: YoutubeRole[]
  enhancedLrcBackend: YoutubeEnhancedLrcBackend
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
