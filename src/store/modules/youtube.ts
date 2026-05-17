import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import HttpApi from 'lib/HttpApi'
import type { IYoutubeAccess, IYoutubePrefs, YoutubeQualityPreset, YoutubeRole } from 'shared/types'
import {
  YOUTUBE_CONFIG_REQUEST,
  YOUTUBE_CONFIG_SAVE,
  YOUTUBE_ACCESS_REQUEST,
  YOUTUBE_SEARCH_REQUEST,
  YOUTUBE_DOWNLOAD_START,
  YOUTUBE_DOWNLOAD_STATUS,
  LOGOUT,
} from 'shared/actionTypes'

const api = new HttpApi('youtube')

export interface IYoutubeSearchResult {
  videoId: string
  title: string
  channel: string
  publishedAt: string
  thumbnail: string
  duration: number
  viewCount: number
  isKaraoke: boolean
}

export interface IYoutubeSearchPage {
  results: IYoutubeSearchResult[]
  nextPageToken: string | null
}

export interface YoutubeConfigPatch {
  isEnabled?: boolean
  downloadPathId?: number | null
  useCookies?: boolean
  qualityPreset?: YoutubeQualityPreset
  musicbrainzMinScore?: number
  allowedRoles?: YoutubeRole[]
  apiKey?: string | null
  cookies?: string | null
}

export interface IYoutubeIdentifyResult {
  found: boolean
  artist?: string
  title?: string
  score?: number | null
}

export const youtubeIdentify = createAsyncThunk<
  IYoutubeIdentifyResult,
  { title: string, artist?: string }
>(
  'youtube/IDENTIFY',
  async ({ title, artist }) => {
    const params = new URLSearchParams({ title })
    if (artist) params.set('artist', artist)
    return api.get<IYoutubeIdentifyResult>(`/identify?${params.toString()}`)
  },
)

export const fetchYoutubeConfig = createAsyncThunk<IYoutubePrefs>(
  YOUTUBE_CONFIG_REQUEST,
  async () => api.get<IYoutubePrefs>('/config'),
)

export const fetchYoutubeAccess = createAsyncThunk<IYoutubeAccess>(
  YOUTUBE_ACCESS_REQUEST,
  async () => api.get<IYoutubeAccess>('/access'),
)

export const saveYoutubeConfig = createAsyncThunk<IYoutubePrefs, YoutubeConfigPatch>(
  YOUTUBE_CONFIG_SAVE,
  async patch => api.put<IYoutubePrefs>('/config', { body: patch }),
)

export const youtubeSearch = createAsyncThunk<IYoutubeSearchPage, string>(
  YOUTUBE_SEARCH_REQUEST,
  async query => api.get<IYoutubeSearchPage>(`/search?q=${encodeURIComponent(query)}`),
)

export const youtubeSearchMore = createAsyncThunk<IYoutubeSearchPage, { query: string, pageToken: string }>(
  'youtube/SEARCH_MORE',
  async ({ query, pageToken }) =>
    api.get<IYoutubeSearchPage>(`/search?q=${encodeURIComponent(query)}&pageToken=${encodeURIComponent(pageToken)}`),
)

export type YoutubeDownloadStatus = 'queued' | 'downloading' | 'awaiting-lyrics' | 'done' | 'error'

export interface IYoutubeDownloadJob {
  videoId: string
  status: YoutubeDownloadStatus
  stage: string | null
  progress: number
  error: string | null
  filename: string | null
  startedAt: number
  finishedAt: number | null
}

export interface YoutubeDownloadStartArgs {
  videoId: string
  artist: string
  title: string
  duration?: number
  mode?: 'spleeter' | 'audioonly'
}

export const youtubeDownloadStart = createAsyncThunk<IYoutubeDownloadJob, YoutubeDownloadStartArgs>(
  YOUTUBE_DOWNLOAD_START,
  async args => api.post<IYoutubeDownloadJob>('/download', { body: args }),
)

export const youtubeDownloadStatus = createAsyncThunk<IYoutubeDownloadJob, string>(
  YOUTUBE_DOWNLOAD_STATUS,
  async videoId => api.get<IYoutubeDownloadJob>(`/download/${encodeURIComponent(videoId)}`),
)

// Fire-and-forget thunk that warms the server-side yt-dlp probe cache for a
// video. No reducer case needed — this is purely a server-side side-effect.
export const youtubeProbe = createAsyncThunk<void, string>(
  'youtube/PROBE',
  async (videoId) => { await api.post<void>(`/probe/${encodeURIComponent(videoId)}`) },
)

export const youtubeSubmitLyrics = createAsyncThunk<void, { videoId: string, lyricsText: string }>(
  'youtube/SUBMIT_LYRICS',
  async ({ videoId, lyricsText }) => {
    await api.post<void>(`/download/${encodeURIComponent(videoId)}/lyrics`, { body: { lyricsText } })
  },
)

export const youtubeCancelLyrics = createAsyncThunk<void, string>(
  'youtube/CANCEL_LYRICS',
  async (videoId) => {
    await api.delete<void>(`/download/${encodeURIComponent(videoId)}/lyrics`)
  },
)

export const clearYoutubeSearch = createAction('youtube/SEARCH_CLEAR')
export const setYoutubeMode = createAction<boolean>('youtube/MODE_SET')
const logout = createAction(LOGOUT)

export interface YoutubeState {
  config: IYoutubePrefs | null
  isConfigLoaded: boolean
  isSaving: boolean
  saveError: string | null

  access: IYoutubeAccess | null
  isAccessLoaded: boolean

  isSearching: boolean
  isLoadingMore: boolean
  searchError: string | null
  searchQuery: string
  searchResults: IYoutubeSearchResult[]
  searchNextPageToken: string | null
  searchPageCount: number
  isModeActive: boolean
  downloads: Record<string, IYoutubeDownloadJob>
}

const initialState: YoutubeState = {
  config: null,
  isConfigLoaded: false,
  isSaving: false,
  saveError: null,
  access: null,
  isAccessLoaded: false,
  isSearching: false,
  isLoadingMore: false,
  searchError: null,
  searchQuery: '',
  searchResults: [],
  searchNextPageToken: null,
  searchPageCount: 0,
  isModeActive: false,
  downloads: {},
}

const youtubeReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchYoutubeConfig.fulfilled, (state, { payload }) => {
      state.config = payload
      state.isConfigLoaded = true
      state.access = {
        isEnabled: payload.isEnabled,
        hasAccess: payload.isEnabled,
        downloadPathConfigured: payload.downloadPathId !== null,
        musicbrainzMinScore: payload.musicbrainzMinScore,
      }
      state.isAccessLoaded = true
    })
    .addCase(fetchYoutubeAccess.fulfilled, (state, { payload }) => {
      state.access = payload
      state.isAccessLoaded = true
    })
    .addCase(saveYoutubeConfig.pending, (state) => {
      state.isSaving = true
      state.saveError = null
    })
    .addCase(saveYoutubeConfig.fulfilled, (state, { payload }) => {
      state.config = payload
      state.isSaving = false
      state.saveError = null
      state.access = {
        isEnabled: payload.isEnabled,
        hasAccess: payload.isEnabled,
        downloadPathConfigured: payload.downloadPathId !== null,
        musicbrainzMinScore: payload.musicbrainzMinScore,
      }
      state.isAccessLoaded = true
    })
    .addCase(saveYoutubeConfig.rejected, (state, { error }) => {
      state.isSaving = false
      state.saveError = error.message ?? 'Failed to save'
    })
    .addCase(youtubeSearch.pending, (state, { meta }) => {
      state.isSearching = true
      state.searchError = null
      state.searchQuery = meta.arg
      state.searchNextPageToken = null
      state.searchPageCount = 0
    })
    .addCase(youtubeSearch.fulfilled, (state, { payload }) => {
      state.searchResults = payload.results
      state.searchNextPageToken = payload.nextPageToken
      state.searchPageCount = 1
      state.isSearching = false
    })
    .addCase(youtubeSearch.rejected, (state, { error }) => {
      state.isSearching = false
      state.searchError = error.message ?? 'Search failed'
      state.searchResults = []
      state.searchNextPageToken = null
      state.searchPageCount = 0
    })
    .addCase(youtubeSearchMore.pending, (state) => {
      state.isLoadingMore = true
    })
    .addCase(youtubeSearchMore.fulfilled, (state, { payload }) => {
      state.searchResults = [...state.searchResults, ...payload.results]
      state.searchNextPageToken = payload.nextPageToken
      state.searchPageCount += 1
      state.isLoadingMore = false
    })
    .addCase(youtubeSearchMore.rejected, (state) => {
      state.isLoadingMore = false
    })
    .addCase(clearYoutubeSearch, (state) => {
      state.searchResults = []
      state.searchQuery = ''
      state.searchError = null
      state.searchNextPageToken = null
      state.searchPageCount = 0
    })
    .addCase(youtubeDownloadStart.pending, (state, { meta }) => {
      const id = meta.arg.videoId
      state.downloads[id] = {
        videoId: id,
        status: 'queued',
        progress: 0,
        error: null,
        filename: null,
        startedAt: Date.now(),
        finishedAt: null,
      }
    })
    .addCase(youtubeDownloadStart.fulfilled, (state, { payload }) => {
      state.downloads[payload.videoId] = payload
    })
    .addCase(youtubeDownloadStart.rejected, (state, { meta, error }) => {
      const id = meta.arg.videoId
      state.downloads[id] = {
        videoId: id,
        status: 'error',
        progress: 0,
        error: error.message ?? 'Download failed',
        filename: null,
        startedAt: Date.now(),
        finishedAt: Date.now(),
      }
    })
    .addCase(youtubeDownloadStatus.fulfilled, (state, { payload }) => {
      state.downloads[payload.videoId] = payload
    })
    .addCase(setYoutubeMode, (state, { payload }) => {
      state.isModeActive = payload
      if (!payload) {
        state.searchResults = []
        state.searchQuery = ''
        state.searchError = null
      }
    })
    .addCase(logout, () => initialState)
})

export default youtubeReducer
