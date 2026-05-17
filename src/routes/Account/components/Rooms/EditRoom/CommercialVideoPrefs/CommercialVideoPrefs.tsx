import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Icon from 'components/Icon/Icon'
import Button from 'components/Button/Button'
import { fetchCommercialStatus, uploadCommercial, deleteCommercial } from 'store/modules/commercial'
import type { IRoomPrefs } from 'shared/types'
import styles from './CommercialVideoPrefs.css'

interface CommercialVideoPrefsProps {
  roomId: number
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
}

const CommercialVideoPrefs = ({ roomId, prefs, onChange }: CommercialVideoPrefsProps) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const fileRef = useRef<HTMLInputElement>(null)

  const hasGlobal = useAppSelector(state => state.commercial.hasGlobal)
  const hasRoomOverride = useAppSelector(state => state.commercial.hasRoomOverride)
  const isUploading = useAppSelector(state => state.commercial.isUploading)
  const error = useAppSelector(state => state.commercial.error)

  const isEnabled = prefs?.commercialVideo?.isEnabled !== false

  useEffect(() => {
    dispatch(fetchCommercialStatus(roomId))
  }, [dispatch, roomId])

  const handleToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...prefs, commercialVideo: { ...prefs?.commercialVideo, isEnabled: e.currentTarget.checked } })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    dispatch(uploadCommercial({ file, roomId })).then(() => {
      dispatch(fetchCommercialStatus(roomId))
    })
    e.target.value = ''
  }

  const handleDeleteOverride = () => {
    if (!confirm(t('rooms.commercialDeleteOverrideConfirm'))) return
    dispatch(deleteCommercial(roomId)).then(() => {
      dispatch(fetchCommercialStatus(roomId))
    })
  }

  return (
    <Accordion headingComponent={(
      <div className={styles.heading}>
        <Icon icon='TELEVISION_PLAY' />
        <div className={styles.title}>{t('rooms.commercialTitle')}</div>
      </div>
    )}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <InputCheckbox
            label={t('rooms.commercialEnabledLabel')}
            checked={isEnabled}
            onChange={handleToggle}
          />
          <div className={styles.note}>{t('rooms.commercialEnabledNote')}</div>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.field}>
          <div className={styles.statusRow}>
            <span>{t('rooms.commercialGlobal')}</span>
            <span className={hasGlobal ? styles.statusActive : styles.statusNone}>
              {hasGlobal ? t('rooms.commercialAvailable') : t('rooms.commercialNotUploaded')}
            </span>
          </div>
          <div className={styles.statusRow}>
            <span>{t('rooms.commercialOverride')}</span>
            <span className={hasRoomOverride ? styles.statusActive : styles.statusNone}>
              {hasRoomOverride ? t('rooms.commercialAvailable') : t('rooms.commercialNotUploaded')}
            </span>
          </div>
        </div>

        <div className={styles.actions}>
          <input
            ref={fileRef}
            type='file'
            accept='video/mp4,.mp4'
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            variant='primary'
          >
            {isUploading ? t('prefs.commercialUploading') : t('rooms.commercialUploadOverride')}
          </Button>
          {hasRoomOverride && (
            <Button onClick={handleDeleteOverride} variant='danger' disabled={isUploading}>
              {t('rooms.commercialDeleteOverride')}
            </Button>
          )}
        </div>
        <div className={styles.note}>{t('rooms.commercialOverrideNote')}</div>
      </div>
    </Accordion>
  )
}

export default CommercialVideoPrefs
