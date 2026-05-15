import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import { formatDuration } from 'lib/dateTime'
import {
  closeSongInfo,
  setPreferredSong,
  setRoomPreferredSong,
  setUserPreferredSong,
} from 'store/modules/songInfo'
import styles from './SongInfo.css'

const SongInfo = () => {
  const { isLoading, isVisible, songId, media } = useAppSelector(state => state.songInfo)
  const { isAdmin, role, roomId, userId } = useAppSelector(state => state.user)
  const isRoomManager = role === 'room_manager'

  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const handleCloseSongInfo = () => dispatch(closeSongInfo())

  // Global default — admin only
  const handleSetGlobal = (mediaId: number, isPreferred: boolean) =>
    dispatch(setPreferredSong({ songId, mediaId, isPreferred }))

  // Room default — room manager (or admin acting in a room context)
  const handleSetRoom = (mediaId: number, isPreferred: boolean) =>
    dispatch(setRoomPreferredSong({ songId, mediaId, roomId, isPreferred }))

  // Personal preference — any authenticated user
  const handleSetUser = (mediaId: number, isPreferred: boolean) =>
    dispatch(setUserPreferredSong({ songId, mediaId, isPreferred }))

  const mediaDetails = media.result.map((mediaId) => {
    const item = media.entities[mediaId]
    const isGlobal = !!item.isPreferred
    const isRoom = !!item.roomPreferred
    const isUser = !!item.userPreferred

    // Determine which tier is currently active for this user so we can
    // show a clear "this is what you'll get" indicator.
    const activeLabel = isUser
      ? t('songInfo.activeUser')
      : isRoom
        ? t('songInfo.activeRoom')
        : isGlobal
          ? t('songInfo.activeGlobal')
          : null

    return (
      <div key={item.mediaId} className={styles.media}>
        {item.path + (item.path.indexOf('/') === 0 ? '/' : '\\') + item.relPath}
        <br />
        <span className={styles.label}>{t('songInfo.duration')}: </span>
        {formatDuration(item.duration)}
        <br />
        <span className={styles.label}>{t('songInfo.mediaId')}: </span>
        {mediaId}

        {activeLabel && (
          <>
            <br />
            <span className={styles.label}>{t('songInfo.status')}: </span>
            <strong>{activeLabel}</strong>
          </>
        )}

        {/* Global default — admin only */}
        {isAdmin && (
          <>
            <br />
            <span className={styles.label}>{t('songInfo.globalDefault')}: </span>
            {isGlobal
              && (
                <span>
                  <strong>{t('common.yes')}</strong>
&nbsp;
                  <a onClick={() => handleSetGlobal(mediaId, false)}>{t('common.unset')}</a>
                </span>
              )}
            {!isGlobal
              && (
                <span>
                  {t('common.no')}&nbsp;
                  <a onClick={() => handleSetGlobal(mediaId, true)}>{t('common.set')}</a>
                </span>
              )}
          </>
        )}

        {/* Room default — room managers and admins acting in a room */}
        {(isAdmin || isRoomManager) && typeof roomId === 'number' && (
          <>
            <br />
            <span className={styles.label}>{t('songInfo.roomDefault')}: </span>
            {isRoom
              && (
                <span>
                  <strong>{t('common.yes')}</strong>
&nbsp;
                  <a onClick={() => handleSetRoom(mediaId, false)}>{t('common.unset')}</a>
                </span>
              )}
            {!isRoom
              && (
                <span>
                  {t('common.no')}&nbsp;
                  <a onClick={() => handleSetRoom(mediaId, true)}>{t('common.set')}</a>
                </span>
              )}
          </>
        )}

        {/* Personal preference — any logged-in user (including guests) */}
        {typeof userId === 'number' && (
          <>
            <br />
            <span className={styles.label}>{t('songInfo.myVersion')}: </span>
            {isUser
              && (
                <span>
                  <strong>{t('common.yes')}</strong>
&nbsp;
                  <a onClick={() => handleSetUser(mediaId, false)}>{t('common.clear')}</a>
                </span>
              )}
            {!isUser
              && (
                <span>
                  {t('common.no')}&nbsp;
                  <a onClick={() => handleSetUser(mediaId, true)}>{t('common.set')}</a>
                </span>
              )}
          </>
        )}
      </div>
    )
  })

  return (
    <Modal
      visible={isVisible}
      onClose={handleCloseSongInfo}
      title={t('common.songInfo')}
    >
      <div className={styles.container}>
        <p>
          <span className={styles.label}>{t('songInfo.songId')}: </span>
          {songId}
          <br />
          <span className={styles.label}>{t('songInfo.mediaFiles')}: </span>
          {isLoading ? '?' : media.result.length}
        </p>

        <div className={styles.mediaContainer}>
          {isLoading ? <p>{t('common.loading')}</p> : mediaDetails}
        </div>

        <div>
          <Button variant='primary' onClick={handleCloseSongInfo}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default SongInfo
