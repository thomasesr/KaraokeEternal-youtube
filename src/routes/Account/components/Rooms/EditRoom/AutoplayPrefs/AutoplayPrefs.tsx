import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Accordion from 'components/Accordion/Accordion'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Icon from 'components/Icon/Icon'
import type { IRoomPrefs } from 'shared/types'
import styles from './AutoplayPrefs.css'

interface AutoplayPrefsProps {
  prefs: Partial<IRoomPrefs>
  onChange: (prefs: Partial<IRoomPrefs>) => void
}

const AutoplayPrefs = ({ prefs, onChange }: AutoplayPrefsProps) => {
  const { t } = useTranslation()

  const handleSetPref = useCallback((update: Partial<IRoomPrefs>) => {
    onChange({ ...prefs, ...update })
  }, [onChange, prefs])

  return (
    <Accordion headingComponent={(
      <div className={styles.heading}>
        <Icon icon='PLAY_NEXT' />
        <div className={styles.title}>{t('rooms.autoplayTitle')}</div>
      </div>
    )}
    >
      <div className={styles.content}>
        <div className={styles.field}>
          <InputCheckbox
            label={t('rooms.autoplayLabel')}
            checked={prefs?.autoplay?.isEnabled ?? false}
            onChange={event => handleSetPref({ autoplay: { isEnabled: event.currentTarget.checked } })}
          />
          <div className={styles.note}>{t('rooms.autoplayNote')}</div>
        </div>
      </div>
    </Accordion>
  )
}

export default AutoplayPrefs
