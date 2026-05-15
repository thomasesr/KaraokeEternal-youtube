import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import { RootState } from 'store/store'
import type { Path, Role } from 'shared/types'
import {
  PREFS_RECEIVE,
  PREFS_REQUEST,
  PREFS_SET,
  PREFS_PATH_UPDATE,
  PREFS_PATH_SET_MANAGER,
  PREFS_PATH_SET_PRIORITY,
  PREFS_PUSH,
  PREFS_REQ_SCANNER_START,
  PREFS_REQ_SCANNER_STOP,
  SCANNER_WORKER_STATUS,
  LRC_ENHANCE_STATUS,
  USER_PLAYER_PREFS_SET,
  USER_PLAYER_PREFS_PUSH,
  LOGOUT,
} from 'shared/actionTypes'

import HttpApi from 'lib/HttpApi'
const api = new HttpApi('prefs')

// ------------------------------------
// Actions
// ------------------------------------
const logout = createAction(LOGOUT)
export const setPref = createAction<{ key: string, data: unknown }>(PREFS_SET)
export const setUserPlayerPref = createAction<{ key: string, data: unknown }>(USER_PLAYER_PREFS_SET)
const userPlayerPrefsPush = createAction<{ lrcFontSize: number; lrcDefaultOffset: number; isReplayGainEnabled: boolean }>(USER_PLAYER_PREFS_PUSH)
export const receivePrefs = createAction<object>(PREFS_RECEIVE)
export const setPathPriority = createAction<number[]>(PREFS_PATH_SET_PRIORITY)
const prefsPush = createAction<PrefsState>(PREFS_PUSH)
const scannerWorkerStatus = createAction<{ isScanning: boolean, pct: number, text: string }>(SCANNER_WORKER_STATUS)
const lrcEnhanceStatus = createAction<{ isEnhancing: boolean, pct: number, text: string }>(LRC_ENHANCE_STATUS)

export const setPathPrefs = createAsyncThunk(
  PREFS_PATH_UPDATE,
  async ({
    pathId,
    data,
  }: {
    pathId: number
    data: FormData
  }, thunkAPI) => {
    const response = await api.put(`/path/${pathId}`, {
      body: data,
    })

    thunkAPI.dispatch(receivePrefs(response))
  },
)

export const setPathManager = createAsyncThunk(
  PREFS_PATH_SET_MANAGER,
  async ({
    pathId,
    userId,
  }: {
    pathId: number
    userId: number | null
  }, thunkAPI) => {
    const response = await api.put(`/path/${pathId}/manager`, {
      body: { userId },
    })

    thunkAPI.dispatch(receivePrefs(response))
  },
)

export const fetchPrefs = createAsyncThunk<object, void, { state: RootState }>(
  PREFS_REQUEST,
  async (_, thunkAPI) => {
    const response = await api.get('')

    // sign out if we see isFirstRun flag
    if (response.isFirstRun && thunkAPI.getState().user.userId !== null) {
      thunkAPI.dispatch(logout())
    }

    return response
  },
)

export const requestScan = createAsyncThunk(
  PREFS_REQ_SCANNER_START,
  async (pathId: number) => await api.get(`/path/${pathId}/scan`),
)

export const requestScanAll = createAsyncThunk(
  PREFS_REQ_SCANNER_START,
  async () => await api.get('/paths/scan'),
)

export const requestScanStop = createAsyncThunk(
  PREFS_REQ_SCANNER_STOP,
  async () => await api.get('/paths/scan/stop'),
)

// ------------------------------------
// Reducer
// ------------------------------------
interface PrefsState {
  isFirstRun?: boolean
  isScanning: boolean
  isReplayGainEnabled: boolean
  lrcDefaultOffset: number
  lrcFontSize: number
  paths: {
    result: number[]
    entities: Record<number, Path>
  }
  roles: {
    result: number[]
    entities: Record<number, Role>
  }
  scannerPct: number
  scannerText: string
  isEnhancing: boolean
  enhancePct: number
  enhanceText: string
}

const initialState: PrefsState = {
  isScanning: false,
  isReplayGainEnabled: false,
  lrcDefaultOffset: 0,
  lrcFontSize: 1,
  paths: {
    result: [],
    entities: {},
  },
  roles: {
    result: [],
    entities: {},
  },
  scannerPct: 0,
  scannerText: '',
  isEnhancing: false,
  enhancePct: 0,
  enhanceText: '',
}

const prefsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchPrefs.fulfilled, (state, { payload }) => ({
      ...state,
      ...payload,
    }))
    .addCase(receivePrefs, (state, { payload }) => ({
      ...state,
      ...payload,
    }))
    .addCase(prefsPush, (state, { payload }) => ({
      ...state,
      ...payload,
    }))
    .addCase(scannerWorkerStatus, (state, { payload }) => ({
      ...state,
      isScanning: payload.isScanning,
      scannerPct: payload.pct,
      scannerText: payload.text,
    }))
    .addCase(lrcEnhanceStatus, (state, { payload }) => ({
      ...state,
      isEnhancing: payload.isEnhancing,
      enhancePct: payload.pct,
      enhanceText: payload.text,
    }))
    .addCase(userPlayerPrefsPush, (state, { payload }) => ({
      ...state,
      lrcFontSize: payload.lrcFontSize,
      lrcDefaultOffset: payload.lrcDefaultOffset,
      isReplayGainEnabled: payload.isReplayGainEnabled,
    }))
})

export default prefsReducer
