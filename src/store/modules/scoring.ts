import { createAction, createReducer } from '@reduxjs/toolkit'
import type { AppThunk } from 'store/store'
import { SCORING_START, SCORING_RESULT, SCORING_CANCEL, SCORING_VOTE_REQUEST } from 'shared/actionTypes'

// ------------------------------------
// State
// ------------------------------------
interface ScoringState {
  isActive: boolean
  queueId: number | null
  songId: number | null
  singerUserId: number | null
  endsAt: number | null
  myVote: number | null
  result: number | null
  wasSkipped: boolean
}

const initialState: ScoringState = {
  isActive: false,
  queueId: null,
  songId: null,
  singerUserId: null,
  endsAt: null,
  myVote: null,
  result: null,
  wasSkipped: false,
}

// ------------------------------------
// Actions
// ------------------------------------
const scoringStart = createAction<{
  queueId: number
  songId: number
  singerUserId: number
  endsAt: number
  duration: number
}>(SCORING_START)

const scoringResult = createAction<{
  queueId: number
  median: number
  voteCount: number
  wasSkipped: boolean
}>(SCORING_RESULT)

const scoringCancel = createAction(SCORING_CANCEL)

export const clearScoringResult = createAction('scoring/CLEAR_RESULT')

// ------------------------------------
// Thunks
// ------------------------------------
const SCORING_PUSH_LEAD_SECONDS = 5

export function submitVote (score: number): AppThunk {
  return (dispatch, getState) => {
    dispatch({
      type: SCORING_VOTE_REQUEST,
      payload: { score },
    })
    dispatch(setMyVote(score))
  }
}

const setMyVote = createAction<number>('scoring/SET_MY_VOTE')

// ------------------------------------
// Reducer
// ------------------------------------
const scoringReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(scoringStart, (state, action) => {
      const { queueId, songId, singerUserId, endsAt, duration } = action.payload
      state.isActive = true
      state.queueId = queueId
      state.songId = songId
      state.singerUserId = singerUserId
      // widget lifetime = SCORING_PUSH_LEAD_SECONDS + duration (client already received lead push 5s ago)
      state.endsAt = endsAt + SCORING_PUSH_LEAD_SECONDS * 1000
      state.myVote = null
      state.result = null
      state.wasSkipped = false
    })
    .addCase(scoringResult, (state, action) => {
      state.isActive = false
      state.result = action.payload.median
      state.wasSkipped = action.payload.wasSkipped
    })
    .addCase(scoringCancel, () => initialState)
    .addCase(clearScoringResult, () => initialState)
    .addCase(setMyVote, (state, action) => {
      state.myVote = action.payload
    })
})

export default scoringReducer
