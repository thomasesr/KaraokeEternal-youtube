import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Accordion from 'components/Accordion/Accordion'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Icon from 'components/Icon/Icon'
import type { IRoomPrefs } from 'shared/types'
import styles from './ScoringPrefs.css'

const DEFAULT_SCORING_DURATION = 15

interface ScoringPrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
}

const ScoringPrefs = ({ prefs, onChange }: ScoringPrefsProps) => {
  const { t } = useTranslation()
  const isEnabled = prefs?.scoring?.isEnabled ?? false
  const duration = prefs?.scoring?.duration ?? DEFAULT_SCORING_DURATION

  const handleSetPref = useCallback((update: Partial<IRoomPrefs>) => {
    onChange({ ...prefs, ...update })
  }, [onChange, prefs])

  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.currentTarget.value, 10)
    if (Number.isFinite(v) && v >= 5 && v <= 30) {
      handleSetPref({ scoring: { ...prefs?.scoring, isEnabled, duration: v } })
    }
  }

  return (
    <Accordion headingComponent={(
      <div className={styles.heading}>
        <Icon icon='STAR_FULL' />
        <div className={styles.title}>{t('rooms.scoringTitle')}</div>
      </div>
    )}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <InputCheckbox
            label={t('rooms.scoringEnabledLabel')}
            checked={isEnabled}
            onChange={event => handleSetPref({ scoring: { ...prefs?.scoring, isEnabled: event.currentTarget.checked } })}
          />
          <div className={styles.note}>{t('rooms.scoringEnabledNote')}</div>
        </div>
        {isEnabled && (
          <div className={styles.field}>
            <label htmlFor='scoring-duration'>
              {t('rooms.scoringDurationLabel', { seconds: duration })}
            </label>
            <input
              id='scoring-duration'
              type='range'
              min={5}
              max={30}
              step={5}
              value={duration}
              onChange={handleDurationChange}
            />
            <div className={styles.note}>{t('rooms.scoringDurationNote')}</div>
          </div>
        )}
      </div>
    </Accordion>
  )
}

export default ScoringPrefs
