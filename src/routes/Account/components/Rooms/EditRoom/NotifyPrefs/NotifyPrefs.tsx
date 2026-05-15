import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import type { IRoomPrefs } from 'shared/types'
import styles from './NotifyPrefs.css'

const DEFAULT_LEAD_SECONDS = 20

interface NotifyPrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
}

const NotifyPrefs = ({ prefs, onChange }: NotifyPrefsProps) => {
  const { t } = useTranslation()
  const leadSeconds = prefs?.notifyLeadSeconds ?? DEFAULT_LEAD_SECONDS

  const handleSetPref = useCallback((update: Partial<IRoomPrefs>) => {
    onChange({ ...prefs, ...update })
  }, [onChange, prefs])

  const handleLeadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.currentTarget.value, 10)
    if (Number.isFinite(v) && v >= 5 && v <= 120) {
      handleSetPref({ notifyLeadSeconds: v })
    }
  }

  return (
    <Accordion headingComponent={(
      <div className={styles.heading}>
        <Icon icon='ALERT_OUTLINE' />
        <div className={styles.title}>{t('rooms.notifyTitle')}</div>
      </div>
    )}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <label htmlFor='notify-lead-seconds'>
            {t('rooms.notifyLeadLabel', { seconds: leadSeconds })}
          </label>
          <input
            id='notify-lead-seconds'
            type='range'
            min={5}
            max={120}
            step={5}
            value={leadSeconds}
            onChange={handleLeadChange}
          />
          <div className={styles.note}>{t('rooms.notifyLeadNote')}</div>
        </div>
      </div>
    </Accordion>
  )
}

export default NotifyPrefs
