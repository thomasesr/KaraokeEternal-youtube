import React from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import styles from './NoPlayer.css'

const NoPlayer = () => {
  const { t } = useTranslation()
  return (
    <div className={styles.container}>
      <p className={styles.msg}>
        {t('display.noPlayerInRoom')} (
        <Link to='/player' target='_blank' replace>{t('display.launchPlayer')}</Link>
        )
      </p>
    </div>
  )
}

export default NoPlayer
