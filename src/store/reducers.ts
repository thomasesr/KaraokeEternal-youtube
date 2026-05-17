import { combineSlices } from '@reduxjs/toolkit'
import { optimistic } from 'redux-optimistic-ui'

import commercial from './modules/commercial'
import artists from 'routes/Library/modules/artists'
import library from 'routes/Library/modules/library'
import prefs from './modules/prefs'
import queue from 'routes/Queue/modules/queue'
import rooms from './modules/rooms'
import songs from 'routes/Library/modules/songs'
import songInfo from './modules/songInfo'
import starCounts from 'routes/Library/modules/starCounts'
import status from './modules/status'
import ui from './modules/ui'
import user from './modules/user'
import userStars from './modules/userStars'
import youtube from './modules/youtube'
import push from './modules/push'
import scoring from './modules/scoring'
import highScores from './modules/highScores'

export interface LazyLoadedSlices {} // eslint-disable-line @typescript-eslint/no-empty-object-type

const combinedReducer = combineSlices({
  artists,
  commercial,
  highScores,
  library,
  prefs,
  push,
  queue: optimistic(queue),
  rooms,
  scoring,
  songs,
  songInfo,
  starCounts,
  status,
  ui,
  user,
  userStars: optimistic(userStars),
  youtube,
}).withLazyLoadedSlices<LazyLoadedSlices>()

export default combinedReducer
