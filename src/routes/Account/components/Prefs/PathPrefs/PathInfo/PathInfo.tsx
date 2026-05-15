import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { fetchUsers } from 'routes/Account/modules/users'
import { setPathManager } from 'store/modules/prefs'
import Modal from 'components/Modal/Modal'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Button from 'components/Button/Button'
import styles from './PathInfo.css'
import type { Path } from 'shared/types'

interface PathInfoProps {
  onClose: () => void
  onRemove: (pathId: number) => void
  onUpdate: (pathId: number, data: object) => void
  path: Path
}

const PathInfo = ({ onClose, onRemove, onUpdate, path }: PathInfoProps) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const users = useAppSelector(state => state.users)

  useEffect(() => {
    if (users && users.result.length === 0) {
      dispatch(fetchUsers())
    }
  }, [dispatch, users])

  const handleChange = (data: Record<string, boolean>) => {
    onUpdate(path.pathId, data)
  }

  const handleRemove = () => onRemove(path.pathId)

  const roomManagers = (users?.result ?? [])
    .filter(uid => users!.entities[uid].role === 'room_manager')

  const handleManagerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.currentTarget.value
    dispatch(setPathManager({ pathId: path.pathId, userId: val === '' ? null : parseInt(val, 10) }))
  }

  return (
    <Modal
      onClose={onClose}
      title={t('prefs.mediaFolder')}
      buttons={(
        <>
          <Button onClick={handleRemove} variant='danger'>Remove Folder</Button>
          <Button onClick={onClose} variant='primary'>Done</Button>
        </>
      )}
    >
      <div>
        <p className={styles.path}>
          {path?.path}
          <br />
          <span className={styles.label}>pathId: </span>
          {path?.pathId}
        </p>

        <form className={styles.form}>
          <InputCheckbox
            label={t('prefs.watchFolder')}
            defaultChecked={path?.prefs?.isWatchingEnabled}
            onChange={event => handleChange({ isWatchingEnabled: event.currentTarget.checked })}
          />
          <InputCheckbox
            label={t('prefs.videoKeying')}
            defaultChecked={path?.prefs?.isVideoKeyingEnabled}
            onChange={event => handleChange({ isVideoKeyingEnabled: event.currentTarget.checked })}
          />
          <InputCheckbox
            label={t('prefs.processAudioOnly')}
            defaultChecked={path?.prefs?.isAudioOnlyEnabled}
            onChange={event => handleChange({ isAudioOnlyEnabled: event.currentTarget.checked })}
          />
          <div>
            <label className={styles.label}>Room manager (exclusive uploader)</label>
            <select
              className={styles.select}
              value={path?.managedByUserId ?? ''}
              onChange={handleManagerChange}
            >
              <option value=''>— unmanaged (visible to all) —</option>
              {roomManagers.map(uid => (
                <option key={uid} value={uid}>
                  {users!.entities[uid].name}{users!.entities[uid].username ? ` (${users!.entities[uid].username})` : ''}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>
    </Modal>
  )
}

export default PathInfo
