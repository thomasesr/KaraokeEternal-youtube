import React from 'react'
import { useTranslation } from 'react-i18next'
import Panel from 'components/Panel/Panel'
import CommercialPrefs from './CommercialPrefs/CommercialPrefs'
import PathPrefs from './PathPrefs/PathPrefs'
import PlayerPrefs from './PlayerPrefs/PlayerPrefs'
import ThemePrefs from './ThemePrefs/ThemePrefs'
import YoutubePrefs from './YoutubePrefs/YoutubePrefs'
import styles from './Prefs.css'

const Prefs = () => {
  const { t } = useTranslation()
  return (
    <Panel title={t('prefs.title')} contentClassName={styles.content}>
      <>
        <ThemePrefs />
        <PathPrefs />
        <PlayerPrefs />
        <YoutubePrefs />
        <CommercialPrefs />
      </>
    </Panel>
  )
}

export default Prefs
