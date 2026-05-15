import { ensureState } from 'redux-optimistic-ui'
import { createSelector } from '@reduxjs/toolkit'
import { Searcher } from 'fast-fuzzy'
import { RootState } from 'store/store'

const getArtists = (state: RootState) => state.artists
const getSongs = (state: RootState) => state.songs
const getFilterStr = (state: RootState) => state.library.filterStr.trim().toLowerCase()
const getFilterStarred = (state: RootState) => state.library.filterStarred
const getStarredArtists = (state: RootState) => ensureState(state.userStars).starredArtists
const getStarredSongs = (state: RootState) => ensureState(state.userStars).starredSongs
const getUserId = (state: RootState) => state.user.userId
const getUserIsAdmin = (state: RootState) => state.user.isAdmin
const getRoomManagerIds = (state: RootState) => state.user.roomManagerIds

// filter songs by managed folder visibility:
//   admin           → see everything
//   room_manager    → unmanaged + their own managed folder
//   standard/guest  → unmanaged + folders managed by any manager of their room
export const getVisibleSongs = createSelector(
  [getSongs, getUserId, getUserIsAdmin, getRoomManagerIds],
  (songs, userId, isAdmin, roomManagerIds) => ({
    ...songs,
    result: songs.result.filter((songId) => {
      const m = songs.entities[songId].managedByUserId
      if (m === null || m === undefined) return true // unmanaged → visible to all
      if (isAdmin) return true
      if (m === userId) return true // room_manager sees own folder
      if (roomManagerIds.length > 0) return roomManagerIds.includes(m) // standard/guest
      return false
    }),
  }),
)

export const getVisibleArtists = createSelector(
  [getArtists, getVisibleSongs],
  (artists, visibleSongs) => {
    const visibleSet = new Set(visibleSongs.result)
    const result: number[] = []
    const entities = { ...artists.entities }

    for (const artistId of artists.result) {
      const songIds = (artists.entities[artistId].songIds ?? []).filter(id => visibleSet.has(id))

      if (songIds.length) {
        entities[artistId] = { ...artists.entities[artistId], songIds }
        result.push(artistId)
      }
    }

    return { result, entities }
  },
)

const getArtistSearcher = createSelector(
  [getVisibleArtists],
  artists => new Searcher(artists.result as unknown as object[], {
    keySelector: ((artistId: number) => artists.entities[artistId].name) as unknown as (s: object) => string,
    threshold: 0.8,
  }),
)

const getSongSearcher = createSelector(
  [getVisibleSongs],
  songs => new Searcher(songs.result as unknown as object[], {
    keySelector: ((songId: number) => songs.entities[songId].title) as unknown as (s: object) => string,
    threshold: 0.8,
  }),
)

// #1: keyword filters
const getArtistsByKeyword = createSelector(
  [getVisibleArtists, getFilterStr, getArtistSearcher],
  (artists, str, searcher) => {
    if (!str) return artists.result

    return searcher.search(str, {
      returnMatchData: true,
    }).map(match => match.item as unknown as number)
  })

const getSongsByKeyword = createSelector(
  [getVisibleSongs, getFilterStr, getSongSearcher],
  (songs, str, searcher) => {
    if (!str) return songs.result

    return searcher.search(str, {
      returnMatchData: true,
    }).map(match => match.item as unknown as number)
  })

// #2: starred/hidden filters
const getArtistsByView = createSelector(
  [getArtistsByKeyword, getFilterStarred, getStarredArtists],
  (artistsWithKeyword, filterStarred, starredArtists) =>
    artistsWithKeyword.filter((artistId) => {
      return filterStarred ? starredArtists.includes(artistId) : true
    }),
)

const getSongsByView = createSelector(
  [getSongsByKeyword, getFilterStarred, getStarredSongs],
  (songsWithKeyword, filterStarred, starredSongs) =>
    songsWithKeyword.filter((songId) => {
      return filterStarred ? starredSongs.includes(songId) : true
    }),
)

const getSearchResults = createSelector(
  [getArtistsByView, getSongsByView],
  (artistsResult, songsResult) => ({
    artistsResult,
    songsResult,
  }),
)

export default getSearchResults
