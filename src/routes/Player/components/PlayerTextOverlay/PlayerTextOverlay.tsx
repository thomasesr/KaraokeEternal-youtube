import React, { useState } from 'react'
import { useAppDispatch } from 'store/hooks'
import { requestPlay } from 'store/modules/status'
import ColorCycle from './ColorCycle/ColorCycle'
import UpNow from './UpNow/UpNow'
import Icon from 'components/Icon/Icon'
import type { QueueItem } from 'shared/types'
import styles from './PlayerTextOverlay.css'

interface PlayerTextOverlayProps {
  queueItem?: QueueItem
  nextQueueItem?: QueueItem
  isAtQueueEnd: boolean
  isQueueEmpty: boolean
  isErrored: boolean
  isWaitingForSinger?: boolean
  waitingForUser?: string | null
  width: number
  height: number
}

const PlayerTextOverlay = ({
  isQueueEmpty,
  isAtQueueEnd,
  isErrored,
  isWaitingForSinger,
  waitingForUser,
  nextQueueItem,
  queueItem,
  width,
  height,
}: PlayerTextOverlayProps) => {
  const dispatch = useAppDispatch()
  const handlePlay = () => dispatch(requestPlay())
  const [errorOffset] = useState(() => Math.random() * -300)

  let Component

  if (isWaitingForSinger) {
    Component = (
      <>
        <svg width='0' height='0' style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id='play-icon-gradient' x1='0%' y1='0%' x2='100%' y2='100%'>
              <stop offset='0%' className={styles.gradientStop1} />
              <stop offset='100%' className={styles.gradientStop2} />
            </linearGradient>
          </defs>
        </svg>
        <div className={styles.waitingContainer}>
          {waitingForUser && (
            <ColorCycle text={`${waitingForUser.toUpperCase()}'S TURN`} className={styles.backdrop} />
          )}
          <button className={styles.playButton} onClick={handlePlay} aria-label='Play'>
            <Icon icon='PLAY' />
          </button>
        </div>
      </>
    )
  } else if (isQueueEmpty || (isAtQueueEnd && !nextQueueItem)) {
    Component = <ColorCycle text='NO MORE SONGS IN QUEUE! :(' className={styles.backdrop} />
  } else if (!queueItem || (isAtQueueEnd && nextQueueItem)) {
    Component = (
      <>
        <svg width='0' height='0' style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id='play-icon-gradient' x1='0%' y1='0%' x2='100%' y2='100%'>
              <stop offset='0%' className={styles.gradientStop1} />
              <stop offset='100%' className={styles.gradientStop2} />
            </linearGradient>
          </defs>
        </svg>
        <button className={styles.playButton} onClick={handlePlay} aria-label='Play'>
          <Icon icon='PLAY' />
        </button>
      </>
    )
  } else if (isErrored) {
    Component = (
      <>
        <ColorCycle text='OOPS...' offset={errorOffset} className={styles.backdrop} />
        <ColorCycle text='SEE QUEUE FOR DETAILS' offset={errorOffset} className={styles.backdrop} />
      </>
    )
  } else {
    Component = <UpNow queueItem={queueItem} />
  }

  return (
    <div style={{ width, height }} className={styles.container}>
      {Component}
    </div>
  )
}

export default PlayerTextOverlay
