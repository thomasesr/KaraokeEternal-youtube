import React from 'react'
import Panel from 'components/Panel/Panel'
import PathPrefs from './PathPrefs/PathPrefs'
import PlayerPrefs from './PlayerPrefs/PlayerPrefs'
import ThemePrefs from './ThemePrefs/ThemePrefs'
import YoutubePrefs from './YoutubePrefs/YoutubePrefs'
import styles from './Prefs.css'

const Prefs = () => (
  <Panel title='Preferences' contentClassName={styles.content}>
    <>
      <ThemePrefs />
      <PathPrefs />
      <PlayerPrefs />
      <YoutubePrefs />
    </>
  </Panel>
)

export default Prefs
