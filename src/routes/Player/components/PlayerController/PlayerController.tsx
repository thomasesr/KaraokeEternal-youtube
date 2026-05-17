import React, { useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Player from '../Player/Player'
import PlayerTextOverlay from '../PlayerTextOverlay/PlayerTextOverlay'
import PlayerQR from '../PlayerQR/PlayerQR'
import ScoringPhase from './ScoringPhase/ScoringPhase'
import getRoundRobinQueue from 'routes/Queue/selectors/getRoundRobinQueue'
import { playerLeave, playerError, playerLoad, playerPlay, playerStatus, playerUpdate, type PlayerState } from '../../modules/player'
import getRoomPrefs from '../../selectors/getRoomPrefs'
import { clearScoringResult } from 'store/modules/scoring'
import {
  SCORING_START_REQUEST,
  SCORING_CANCEL_REQUEST,
} from 'shared/actionTypes'
import type { QueueItem } from 'shared/types'

const DEFAULT_NOTIFY_LEAD_SECONDS = 20

function sendPushNotification (
  userId: number,
  title: string,
  body: string,
  actions?: Array<{ action: string; title: string }>,
): void {
  fetch(`${document.baseURI}api/push/send`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, title, body, actions }),
  }).catch(err => console.error('[push] send error:', err))
}

interface PendingAdvance {
  history: number[]
  nextQueueItem: QueueItem | null  // null = queue exhausted after last song
  isAutoplay: boolean
  isNotifyEnabled: boolean
  singerUserId: number
}

interface PlayerControllerProps {
  width: number
  height: number
}

const PlayerController = (props: PlayerControllerProps) => {
  const queue = useAppSelector(getRoundRobinQueue)
  const player = useAppSelector(state => state.player)
  const playerVisualizer = useAppSelector(state => state.playerVisualizer)
  const prefs = useAppSelector(state => state.prefs)
  const roomPrefs = useAppSelector(getRoomPrefs)
  const scoring = useAppSelector(state => state.scoring)
  const songs = useAppSelector(state => state.songs.entities)
  const artists = useAppSelector(state => state.artists.entities)
  const queueItem = queue.entities[player.queueId]
  const nextQueueItem = queue.entities[queue.result[queue.result.indexOf(player.queueId) + 1]]
  const currentSong = queueItem ? songs[queueItem.songId] : null
  const currentArtist = currentSong ? artists[currentSong.artistId] : null

  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const defaultOffsetApplied = useRef(false)
  const defaultFontSizeApplied = useRef(false)
  const leadWarnFired = useRef(false)
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isWaitingRef = useRef(player.isWaitingForSinger)
  const pendingWaitingUserRef = useRef<number | null>(null)
  const pendingSongAdvanceRef = useRef<PendingAdvance | null>(null)
  // set to true when a skip fires during scoring so handleLoadNext bypasses scoring branch
  const skipScoringRef = useRef(false)

  useEffect(() => {
    if (!defaultOffsetApplied.current && typeof prefs.lrcDefaultOffset === 'number') {
      dispatch(playerUpdate({ lrcOffset: prefs.lrcDefaultOffset }))
      defaultOffsetApplied.current = true
    }
  }, [prefs.lrcDefaultOffset, dispatch])

  useEffect(() => {
    if (!defaultFontSizeApplied.current && typeof prefs.lrcFontSize === 'number') {
      dispatch(playerUpdate({ lrcFontSize: prefs.lrcFontSize }))
      defaultFontSizeApplied.current = true
    }
  }, [prefs.lrcFontSize, dispatch])

  // keep ref current for use inside setTimeout callbacks
  useEffect(() => { isWaitingRef.current = player.isWaitingForSinger }, [player.isWaitingForSinger])

  // reset lead warn flag when song changes
  useEffect(() => {
    leadWarnFired.current = false
  }, [player.queueId])

  const handleStatus = useCallback((status?: Partial<PlayerState>) => dispatch(playerStatus(status)), [dispatch])
  const handleLoad = () => dispatch(playerLoad())
  const handlePlay = () => dispatch(playerPlay())
  const handleError = (msg: string) => {
    dispatch(playerError(msg))
    handleStatus()
  }

  const handleReplay = useCallback((queueId: number) => {
    const nextItem = queue.entities[queueId]
    if (!nextItem) return

    const history = JSON.parse(player.historyJSON)

    if (queueId !== player.queueId) {
      const idx = history.lastIndexOf(queueId)
      if (idx !== -1) history.splice(idx)
    }

    handleStatus({
      historyJSON: JSON.stringify(history),
      isAtQueueEnd: false,
      isPlaying: true,
      isWaitingForSinger: false,
      isVideoKeyingEnabled: nextItem.isVideoKeyingEnabled,
      mediaType: nextItem.mediaType,
      position: 0,
      queueId: nextItem.queueId,
      nextUserId: null,
      _isReplayingQueueId: null,
    })
  }, [handleStatus, player.historyJSON, player.queueId, queue.entities])

  // shared logic for advancing to the next song (used by normal and scoring-deferred paths)
  const advanceToNext = useCallback((pending: PendingAdvance) => {
    const { history, nextQueueItem: next, isAutoplay, isNotifyEnabled, singerUserId } = pending

    if (isNotifyEnabled) {
      sendPushNotification(
        singerUserId,
        t('player.notifYourTurnTitle'),
        isAutoplay ? t('player.notifAutoplayBody') : t('player.notifYourTurnBody'),
        isAutoplay ? undefined : [{ action: 'play-now', title: t('player.notifPlayNow') }],
      )
    }

    if (!isAutoplay && isNotifyEnabled) {
      pendingWaitingUserRef.current = singerUserId
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
      waitingTimerRef.current = setTimeout(() => {
        waitingTimerRef.current = null
        if (isWaitingRef.current && pendingWaitingUserRef.current !== null) {
          sendPushNotification(
            pendingWaitingUserRef.current,
            t('player.notifWaitingTitle'),
            t('player.notifWaitingBody'),
            [{ action: 'play-now', title: t('player.notifPlayNow') }],
          )
        }
      }, 15_000)
    } else {
      if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null }
      pendingWaitingUserRef.current = null
    }

    handleStatus({
      historyJSON: JSON.stringify(history),
      isAtQueueEnd: false,
      isPlaying: isAutoplay,
      isWaitingForSinger: !isAutoplay,
      isVideoKeyingEnabled: next.isVideoKeyingEnabled,
      mediaType: next.mediaType,
      position: 0,
      queueId: next.queueId,
      nextUserId: null,
      _isPlayingNext: false,
    })
  }, [handleStatus, t])

  const handleLoadNext = useCallback(() => {
    const history = JSON.parse(player.historyJSON)

    if (queueItem && history.lastIndexOf(queueItem.queueId) === -1) {
      history.push(queueItem.queueId)
    }

    const isAutoplay = roomPrefs?.autoplay?.isEnabled ?? false
    const isNotifyEnabled = roomPrefs?.notifyEnabled !== false

    // scoring branch: score current song before advancing (or ending queue)
    // queueItem must be non-null (a real song finished); skip on initial load (queueId === -1)
    const isScoringEnabled = (roomPrefs?.scoring?.isEnabled ?? false) && !skipScoringRef.current && queueItem != null
    if (skipScoringRef.current) skipScoringRef.current = false

    if (isScoringEnabled) {
      pendingSongAdvanceRef.current = {
        history,
        nextQueueItem: nextQueueItem ?? null,
        isAutoplay,
        isNotifyEnabled,
        singerUserId: nextQueueItem?.userId ?? 0,
      }
      dispatch({
        type: SCORING_START_REQUEST,
        payload: {
          queueId: queueItem.queueId,
          songId: queueItem.songId,
          singerUserId: queueItem.userId,
          duration: roomPrefs?.scoring?.duration ?? 15,
        },
      })
      return
    }

    // queue exhausted?
    if (!nextQueueItem) {
      if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null }
      pendingWaitingUserRef.current = null
      handleStatus({
        historyJSON: JSON.stringify(history),
        isAtQueueEnd: true,
        isWaitingForSinger: false,
        mediaType: null,
        _isPlayingNext: false,
      })
      return
    }

    advanceToNext({ history, nextQueueItem, isAutoplay, isNotifyEnabled, singerUserId: nextQueueItem.userId })
  }, [advanceToNext, dispatch, handleStatus, nextQueueItem, player.historyJSON, queueItem, roomPrefs?.autoplay?.isEnabled, roomPrefs?.notifyEnabled, roomPrefs?.scoring?.isEnabled, roomPrefs?.scoring?.duration])

  // called by ScoringPhase when animation completes (or immediately if skipped/no-votes case)
  const handleScoringAnimationComplete = useCallback(() => {
    dispatch(clearScoringResult())
    if (pendingSongAdvanceRef.current) {
      const pending = pendingSongAdvanceRef.current
      pendingSongAdvanceRef.current = null
      if (pending.nextQueueItem == null) {
        // last song scored — set queue exhausted state
        if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null }
        pendingWaitingUserRef.current = null
        handleStatus({
          historyJSON: JSON.stringify(pending.history),
          isAtQueueEnd: true,
          isWaitingForSinger: false,
          mediaType: null,
          _isPlayingNext: false,
        })
      } else {
        advanceToNext(pending as PendingAdvance & { nextQueueItem: QueueItem })
      }
    }
  }, [dispatch, advanceToNext, handleStatus])

  // "lock in" the next user that isn't the currently up user, if possible
  useEffect(() => {
    if (!player.nextUserId || queueItem?.userId === nextQueueItem?.userId) {
      for (let i = queue.result.indexOf(queueItem?.queueId) + 1; i < queue.result.length; i++) {
        if (queueItem?.userId !== queue.entities[queue.result[i]].userId) {
          handleStatus({ nextUserId: queue.entities[queue.result[i]].userId })
          return
        }
      }
    }
  }, [handleStatus, nextQueueItem, player.nextUserId, queue, queueItem])

  // notification: fire once when time remaining drops to lead threshold
  useEffect(() => {
    if (
      roomPrefs?.notifyEnabled !== false
      && !leadWarnFired.current
      && player.nextUserId !== null
      && player.duration > 0
      && player.isPlaying
      && !player.isWaitingForSinger
    ) {
      const leadSeconds = roomPrefs?.notifyLeadSeconds ?? DEFAULT_NOTIFY_LEAD_SECONDS
      const timeRemaining = player.duration - player.position

      if (timeRemaining > 0 && timeRemaining <= leadSeconds) {
        leadWarnFired.current = true
        const secsDisplay = Math.round(timeRemaining)
        sendPushNotification(
          player.nextUserId,
          t('player.notifLeadTitle'),
          t('player.notifLeadBody', { seconds: secsDisplay }),
        )
      }
    }
  }, [player.duration, player.isPlaying, player.isWaitingForSinger, player.nextUserId, player.position, roomPrefs?.notifyEnabled, roomPrefs?.notifyLeadSeconds])

  // clear reminder timer and ref when singer presses Play (waiting ends)
  useEffect(() => {
    if (!player.isWaitingForSinger) {
      if (waitingTimerRef.current) { clearTimeout(waitingTimerRef.current); waitingTimerRef.current = null }
      pendingWaitingUserRef.current = null
    }
  }, [player.isWaitingForSinger])

  // always emit status when any of these change
  useEffect(() => handleStatus({ isVideoKeyingEnabled: queueItem?.isVideoKeyingEnabled }), [
    handleStatus,
    player.cdgAlpha,
    player.cdgSize,
    player.isPlaying,
    player.mp4Alpha,
    player.volume,
    playerVisualizer,
    queueItem?.isVideoKeyingEnabled,
  ])

  // on unmount
  useEffect(() => () => {
    dispatch(playerLeave())
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
  }, [dispatch])

  // playing for first time or playing next?
  // skip detection: if _isPlayingNext fires while scoring is held, cancel scoring
  useEffect(() => {
    if ((player.isPlaying && player.queueId === -1) || player._isPlayingNext) {
      if (player._isPlayingNext && pendingSongAdvanceRef.current !== null) {
        dispatch({ type: SCORING_CANCEL_REQUEST })
        pendingSongAdvanceRef.current = null
        skipScoringRef.current = true
      }
      handleLoadNext()
    }
  }, [dispatch, handleLoadNext, player.isPlaying, player.queueId, player._isPlayingNext])

  // replaying?
  useEffect(() => {
    if (player._isReplayingQueueId !== null) {
      handleReplay(player._isReplayingQueueId)
    }
  }, [handleReplay, player._isReplayingQueueId])

  // queue was exhausted, but is no longer?
  useEffect(() => {
    if (player.isAtQueueEnd && nextQueueItem && player.isPlaying) {
      handleLoadNext()
    }
  }, [handleLoadNext, player.isPlaying, player.isAtQueueEnd, nextQueueItem])

  // retrying after error?
  useEffect(() => {
    if (player.isErrored && player.isPlaying) {
      handleStatus({ isErrored: false })
    }
  }, [handleStatus, player.isErrored, player.isPlaying])

  const waitingUser = player.isWaitingForSinger && queueItem
    ? (queueItem as QueueItem).userDisplayName
    : null

  const isScoringVisible = scoring.isActive || scoring.result !== null

  return (
    <>
      <Player
        cdgAlpha={player.cdgAlpha}
        cdgSize={player.cdgSize}
        lrcFontSize={player.lrcFontSize}
        lrcOffset={player.lrcOffset}
        lrcSmoothScroll={player.lrcSmoothScroll}
        isPlaying={player.isPlaying}
        isVisible={!!queueItem && !player.isErrored && !player.isAtQueueEnd && !player.isWaitingForSinger && !isScoringVisible}
        isReplayGainEnabled={prefs.isReplayGainEnabled}
        isVideoKeyingEnabled={!!queueItem?.isVideoKeyingEnabled}
        isWebGLSupported={player.isWebGLSupported}
        mediaId={queueItem ? queueItem.mediaId : null}
        mediaKey={queueItem ? queueItem.queueId : null}
        songTitle={currentSong?.title ?? ''}
        artistName={currentArtist?.name ?? ''}
        mediaReplayKey={player._lastReplayTime}
        mediaType={queueItem ? queueItem.mediaType : null}
        mp4Alpha={player.mp4Alpha}
        onEnd={handleLoadNext}
        onError={handleError}
        onLoad={handleLoad}
        onPlay={handlePlay}
        onStatus={handleStatus}
        rgTrackGain={queueItem ? queueItem.rgTrackGain : null}
        rgTrackPeak={queueItem ? queueItem.rgTrackPeak : null}
        visualizer={playerVisualizer}
        volume={player.volume}
        width={props.width}
        height={props.height}
      />
      {!isScoringVisible && (
        <PlayerTextOverlay
          queueItem={queueItem as QueueItem}
          nextQueueItem={nextQueueItem as QueueItem}
          isAtQueueEnd={player.isAtQueueEnd}
          isQueueEmpty={!queue.result.length}
          isErrored={player.isErrored}
          isWaitingForSinger={player.isWaitingForSinger}
          waitingForUser={waitingUser}
          width={props.width}
          height={props.height}
        />
      )}
      {isScoringVisible && (
        <ScoringPhase
          isActive={scoring.isActive}
          endsAt={scoring.endsAt}
          result={scoring.result}
          wasSkipped={scoring.wasSkipped}
          width={props.width}
          height={props.height}
          onAnimationComplete={handleScoringAnimationComplete}
        />
      )}
      {roomPrefs?.qr?.isEnabled && (
        <PlayerQR
          height={props.height}
          prefs={roomPrefs.qr}
          queueItem={queueItem}
        />
      )}
    </>
  )
}

export default PlayerController
