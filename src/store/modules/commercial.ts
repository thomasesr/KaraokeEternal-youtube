import { createAsyncThunk, createReducer } from '@reduxjs/toolkit'

export interface CommercialStatus {
  hasGlobal: boolean
  hasRoomOverride: boolean
}

export interface CommercialState {
  hasGlobal: boolean
  hasRoomOverride: boolean
  isLoading: boolean
  isUploading: boolean
  error: string | null
}

const initialState: CommercialState = {
  hasGlobal: false,
  hasRoomOverride: false,
  isLoading: false,
  isUploading: false,
  error: null,
}

const apiBase = () => `${document.baseURI}api/commercial`

export const fetchCommercialStatus = createAsyncThunk<CommercialStatus, number | undefined>(
  'commercial/FETCH_STATUS',
  async (roomId) => {
    const url = roomId !== undefined
      ? `${apiBase()}/status?roomId=${roomId}`
      : `${apiBase()}/status`
    const res = await fetch(url, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },
)

export const uploadCommercial = createAsyncThunk<void, { file: File, roomId?: number }>(
  'commercial/UPLOAD',
  async ({ file, roomId }) => {
    const form = new FormData()
    form.append('file', file)
    if (roomId !== undefined) form.append('roomId', String(roomId))
    const res = await fetch(apiBase(), {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
    })
    if (!res.ok) throw new Error(await res.text())
  },
)

export const deleteCommercial = createAsyncThunk<void, number | undefined>(
  'commercial/DELETE',
  async (roomId) => {
    const url = roomId !== undefined
      ? `${apiBase()}?roomId=${roomId}`
      : apiBase()
    const res = await fetch(url, { method: 'DELETE', credentials: 'same-origin' })
    if (!res.ok) throw new Error(await res.text())
  },
)

const commercialReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchCommercialStatus.pending, (state) => {
      state.isLoading = true
      state.error = null
    })
    .addCase(fetchCommercialStatus.fulfilled, (state, { payload }) => {
      state.isLoading = false
      state.hasGlobal = payload.hasGlobal
      state.hasRoomOverride = payload.hasRoomOverride
    })
    .addCase(fetchCommercialStatus.rejected, (state, { error }) => {
      state.isLoading = false
      state.error = error.message ?? 'Failed to load status'
    })
    .addCase(uploadCommercial.pending, (state) => {
      state.isUploading = true
      state.error = null
    })
    .addCase(uploadCommercial.fulfilled, (state) => {
      state.isUploading = false
    })
    .addCase(uploadCommercial.rejected, (state, { error }) => {
      state.isUploading = false
      state.error = error.message ?? 'Upload failed'
    })
    .addCase(deleteCommercial.pending, (state) => {
      state.error = null
    })
    .addCase(deleteCommercial.rejected, (state, { error }) => {
      state.error = error.message ?? 'Delete failed'
    })
})

export default commercialReducer
