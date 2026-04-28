import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import HttpApi from 'lib/HttpApi'
import type { IYoutubePrefs, YoutubeQualityPreset } from 'shared/types'
import {
  YOUTUBE_CONFIG_REQUEST,
  YOUTUBE_CONFIG_SAVE,
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
}

export interface YoutubeConfigPatch {
  isEnabled?: boolean
  downloadPathId?: number | null
  useCookies?: boolean
  qualityPreset?: YoutubeQualityPreset
  musicbrainzMinScore?: number
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

export const saveYoutubeConfig = createAsyncThunk<IYoutubePrefs, YoutubeConfigPatch>(
  YOUTUBE_CONFIG_SAVE,
  async patch => api.put<IYoutubePrefs>('/config', { body: patch }),
)

export const youtubeSearch = createAsyncThunk<IYoutubeSearchResult[], string>(
  YOUTUBE_SEARCH_REQUEST,
  async query => api.get<IYoutubeSearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
)

export type YoutubeDownloadStatus = 'queued' | 'downloading' | 'done' | 'error'

export interface IYoutubeDownloadJob {
  videoId: string
  status: YoutubeDownloadStatus
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
}

export const youtubeDownloadStart = createAsyncThunk<IYoutubeDownloadJob, YoutubeDownloadStartArgs>(
  YOUTUBE_DOWNLOAD_START,
  async args => api.post<IYoutubeDownloadJob>('/download', { body: args }),
)

export const youtubeDownloadStatus = createAsyncThunk<IYoutubeDownloadJob, string>(
  YOUTUBE_DOWNLOAD_STATUS,
  async videoId => api.get<IYoutubeDownloadJob>(`/download/${encodeURIComponent(videoId)}`),
)

export const clearYoutubeSearch = createAction('youtube/SEARCH_CLEAR')
export const setYoutubeMode = createAction<boolean>('youtube/MODE_SET')
const logout = createAction(LOGOUT)

export interface YoutubeState {
  config: IYoutubePrefs | null
  isConfigLoaded: boolean
  isSaving: boolean
  saveError: string | null

  isSearching: boolean
  searchError: string | null
  searchQuery: string
  searchResults: IYoutubeSearchResult[]
  isModeActive: boolean
  downloads: Record<string, IYoutubeDownloadJob>
}

const initialState: YoutubeState = {
  config: null,
  isConfigLoaded: false,
  isSaving: false,
  saveError: null,
  isSearching: false,
  searchError: null,
  searchQuery: '',
  searchResults: [],
  isModeActive: false,
  downloads: {},
}

const youtubeReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchYoutubeConfig.fulfilled, (state, { payload }) => {
      state.config = payload
      state.isConfigLoaded = true
    })
    .addCase(saveYoutubeConfig.pending, (state) => {
      state.isSaving = true
      state.saveError = null
    })
    .addCase(saveYoutubeConfig.fulfilled, (state, { payload }) => {
      state.config = payload
      state.isSaving = false
      state.saveError = null
    })
    .addCase(saveYoutubeConfig.rejected, (state, { error }) => {
      state.isSaving = false
      state.saveError = error.message ?? 'Failed to save'
    })
    .addCase(youtubeSearch.pending, (state, { meta }) => {
      state.isSearching = true
      state.searchError = null
      state.searchQuery = meta.arg
    })
    .addCase(youtubeSearch.fulfilled, (state, { payload }) => {
      state.searchResults = payload
      state.isSearching = false
    })
    .addCase(youtubeSearch.rejected, (state, { error }) => {
      state.isSearching = false
      state.searchError = error.message ?? 'Search failed'
      state.searchResults = []
    })
    .addCase(clearYoutubeSearch, (state) => {
      state.searchResults = []
      state.searchQuery = ''
      state.searchError = null
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
