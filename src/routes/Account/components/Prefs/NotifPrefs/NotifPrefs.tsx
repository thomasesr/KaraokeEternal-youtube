import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import { subscribePush, unsubscribePush, isPushSubscribed } from 'store/modules/push'
import styles from './NotifPrefs.css'

const NotifPrefs = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const pushError = useAppSelector(state => state.push.error)
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    isPushSubscribed()
      .then((is) => {
        setSubscribed(is)
        setChecking(false)
        return undefined
      })
      .catch(() => setChecking(false))
  }, [])

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }

  const handleToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.currentTarget.checked) {
      await dispatch(subscribePush())
      setSubscribed(true)
    } else {
      await dispatch(unsubscribePush())
      setSubscribed(false)
    }
  }

  return (
    <Accordion headingComponent={(
      <div className={styles.heading}>
        <Icon icon='ALERT_OUTLINE' />
        <div>{t('prefs.notifTitle')}</div>
      </div>
    )}
    >
      <div className={styles.content}>
        {checking
          ? <div>{t('common.loading')}</div>
          : (
              <label className={styles.toggleRow}>
                <input
                  type='checkbox'
                  checked={subscribed}
                  onChange={handleToggle}
                />
                {t('prefs.notifEnable')}
              </label>
            )}
        <div className={styles.note}>{t('prefs.notifNote')}</div>
        {pushError && <div className={styles.error}>{pushError}</div>}
      </div>
    </Accordion>
  )
}

export default NotifPrefs
