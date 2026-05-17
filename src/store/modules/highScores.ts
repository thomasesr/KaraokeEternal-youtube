import { createAction, createReducer } from '@reduxjs/toolkit'
import type { AppThunk } from 'store/store'
import { HIGH_SCORES_REQUEST, HIGH_SCORES_PUSH } from 'shared/actionTypes'

// ------------------------------------
// State
// ------------------------------------
export interface SongScoreEntry {
  songId: number
  avgScore: number
  timesPlayed: number
  title: string
  artistName: string
  singerName: string | null
}

export interface UserScoreEntry {
  userId: number
  name: string
  totalScore: number
  songCount: number
}

interface HighScoresState {
  todaySongs: SongScoreEntry[]
  todayUsers: UserScoreEntry[]
  allTimeUsers: UserScoreEntry[]
  isLoading: boolean
}

const initialState: HighScoresState = {
  todaySongs: [],
  todayUsers: [],
  allTimeUsers: [],
  isLoading: false,
}

// ------------------------------------
// Actions
// ------------------------------------
const highScoresPush = createAction<{
  todaySongs: SongScoreEntry[]
  todayUsers: UserScoreEntry[]
  allTimeUsers: UserScoreEntry[]
}>(HIGH_SCORES_PUSH)

const highScoresLoading = createAction('highScores/LOADING')

// ------------------------------------
// Thunks
// ------------------------------------
export function fetchHighScores (): AppThunk {
  return (dispatch) => {
    dispatch(highScoresLoading())
    dispatch({ type: HIGH_SCORES_REQUEST })
  }
}

// ------------------------------------
// Reducer
// ------------------------------------
const highScoresReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(highScoresLoading, (state) => {
      state.isLoading = true
    })
    .addCase(highScoresPush, (state, action) => {
      state.todaySongs = action.payload.todaySongs
      state.todayUsers = action.payload.todayUsers
      state.allTimeUsers = action.payload.allTimeUsers
      state.isLoading = false
    })
})

export default highScoresReducer
