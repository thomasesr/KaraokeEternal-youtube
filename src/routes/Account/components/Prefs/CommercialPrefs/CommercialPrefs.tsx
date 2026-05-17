import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import Button from 'components/Button/Button'
import { fetchCommercialStatus, uploadCommercial, deleteCommercial } from 'store/modules/commercial'
import styles from './CommercialPrefs.css'

const CommercialPrefs = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const fileRef = useRef<HTMLInputElement>(null)

  const hasGlobal = useAppSelector(state => state.commercial.hasGlobal)
  const isUploading = useAppSelector(state => state.commercial.isUploading)
  const error = useAppSelector(state => state.commercial.error)

  useEffect(() => {
    dispatch(fetchCommercialStatus(undefined))
  }, [dispatch])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    dispatch(uploadCommercial({ file })).then(() => {
      dispatch(fetchCommercialStatus(undefined))
    })
    e.target.value = ''
  }

  const handleDelete = () => {
    if (!confirm(t('prefs.commercialDeleteConfirm'))) return
    dispatch(deleteCommercial(undefined)).then(() => {
      dispatch(fetchCommercialStatus(undefined))
    })
  }

  return (
    <Accordion
      className={styles.container}
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='TELEVISION_PLAY' size={32} className={styles.icon} />
          <div className={styles.title}>{t('prefs.commercial')}</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <p className={styles.note}>{t('prefs.commercialNote')}</p>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.status}>
          {hasGlobal
            ? <span className={styles.statusActive}>{t('prefs.commercialUploaded')}</span>
            : <span className={styles.statusNone}>{t('prefs.commercialNone')}</span>
          }
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
            {isUploading ? t('prefs.commercialUploading') : t('prefs.commercialUpload')}
          </Button>
          {hasGlobal && (
            <Button onClick={handleDelete} variant='danger' disabled={isUploading}>
              {t('prefs.commercialDelete')}
            </Button>
          )}
        </div>
      </div>
    </Accordion>
  )
}

export default CommercialPrefs
