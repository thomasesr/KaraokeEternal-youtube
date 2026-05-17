import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import {
  clearRoomQueue,
  createRoom,
  removeRoom,
  updateRoom,
  requestPrefsPush,
} from 'store/modules/rooms'
import { getFormData } from 'lib/util'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import UserPrefs from './UserPrefs/UserPrefs'
import QRPrefs from './QRPrefs/QRPrefs'
import NotifyPrefs from './NotifyPrefs/NotifyPrefs'
import AutoplayPrefs from './AutoplayPrefs/AutoplayPrefs'
import CommercialVideoPrefs from './CommercialVideoPrefs/CommercialVideoPrefs'
import ScoringPrefs from './ScoringPrefs/ScoringPrefs'
import ManagersPicker from './ManagersPicker/ManagersPicker'
import type { Room, IRoomPrefs } from 'shared/types'
import styles from './EditRoom.css'

interface EditRoomProps {
  room?: Room
  onClose: () => void
}

const EditRoom = ({ onClose, room }: EditRoomProps) => {
  const formRef = useRef(null)
  const [roomPassword, setRoomPassword] = useState(room && room.hasPassword ? '*'.repeat(32) : '')
  const [prefs, setPrefs] = useState<IRoomPrefs>(room?.prefs || {} as IRoomPrefs)
  const [managers, setManagers] = useState<number[]>(room?.managers ?? [])
  const [prevRoom, setPrevRoom] = useState(room)
  const [isPasswordDirty, setIsPasswordDirty] = useState(false)
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  const isAdmin = useAppSelector(state => state.user.isAdmin)
  // a non-admin in this editor is necessarily a room manager (Rooms panel guards this)
  const canRemove = isAdmin
  const canClearQueue = !!room
  const canEditManagers = isAdmin

  if (room !== prevRoom) {
    setPrevRoom(room)
    if (room?.prefs) setPrefs(room.prefs)
    setManagers(room?.managers ?? [])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const data = getFormData(new FormData(formRef.current)) as Record<string, string | IRoomPrefs | number[]>
    data.prefs = prefs

    if (canEditManagers) {
      data.managers = managers
    }

    if (room) {
      if (!isPasswordDirty) delete data.password
      dispatch(updateRoom({ roomId: room.roomId, data }))
    } else {
      if (!data.password) delete data.password
      dispatch(createRoom(data))
    }
  }

  const handleRemoveClick = () => {
    if (room && confirm(t('rooms.removeRoomConfirm', { name: room.name }))) {
      dispatch(removeRoom(room.roomId))
    }
  }

  const handleClearQueueClick = () => {
    if (room && confirm(t('rooms.clearQueueConfirm', { name: room.name }))) {
      dispatch(clearRoomQueue(room.roomId))
    }
  }

  const handlePrefsChange = (newPrefs: IRoomPrefs) => {
    setPrefs(newPrefs)
    if (room) {
      dispatch(requestPrefsPush(room.roomId, newPrefs))
    }
  }

  const handleClose = () => {
    // emit initial prefs
    if (room) {
      dispatch(requestPrefsPush(room.roomId, room.prefs))
    }
    onClose()
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPasswordDirty(true)
    setRoomPassword(e.target.value)
  }

  return (
    <Modal
      className={styles.modal}
      onClose={handleClose}
      title={room ? t('rooms.editRoom') : t('rooms.createRoom')}
    >
      <form onSubmit={handleSubmit} ref={formRef} className={styles.form}>
        <div className={styles.fieldContainer}>
          <input
            type='text'
            autoComplete='off'
            defaultValue={room ? room.name : ''}
            name='name'
            placeholder={t('rooms.roomNamePlaceholder')}
            // https://github.com/facebook/react/issues/23301
            ref={r => typeof room === 'undefined' ? r?.setAttribute('autofocus', 'true') : undefined}
          />

          <input
            type='password'
            autoComplete='new-password'
            value={roomPassword}
            name='password'
            onChange={handlePasswordChange}
            onFocus={e => e.target.select()}
            placeholder={t('rooms.roomPasswordOptionalPlaceholder')}
          />

          <select
            name='status'
            defaultValue={room?.status ?? 'open'}
          >
            <option value='open'>{t('rooms.open')}</option>
            <option value='closed'>{t('rooms.closed')}</option>
          </select>
        </div>

        <div className={styles.prefsContainer}>
          <UserPrefs prefs={prefs} onChange={handlePrefsChange} />
          <QRPrefs prefs={prefs} onChange={handlePrefsChange} roomPassword={roomPassword} roomPasswordDirty={isPasswordDirty} />
          <NotifyPrefs prefs={prefs} onChange={handlePrefsChange} />
          <AutoplayPrefs prefs={prefs} onChange={handlePrefsChange} />
          <ScoringPrefs prefs={prefs} onChange={handlePrefsChange} />
          {room && (
            <CommercialVideoPrefs roomId={room.roomId} prefs={prefs} onChange={handlePrefsChange} />
          )}
          {canEditManagers && (
            <ManagersPicker selected={managers} onChange={setManagers} />
          )}
        </div>

        <div className={styles.btnContainer}>
          <Button type='submit' variant='primary' className={styles.btn}>
            {room ? t('rooms.updateRoom') : t('rooms.createRoom')}
          </Button>
          {canClearQueue && (
            <Button onClick={handleClearQueueClick} className={styles.btn} variant='default'>
              {t('rooms.clearQueue')}
            </Button>
          )}
          {canRemove && room && (
            <Button onClick={handleRemoveClick} className={styles.btn} variant='danger'>
              {t('rooms.removeRoom')}
            </Button>
          )}
          <Button onClick={handleClose} variant='default'>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default EditRoom
