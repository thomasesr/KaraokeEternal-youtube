import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setPref } from 'store/modules/prefs'
import styles from './ThemePrefs.css'

const ThemePrefs = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const currentTheme = useAppSelector(state => state.prefs.theme ?? 'blue')

  const THEMES = [
    { id: 'blue',  label: t('prefs.themeDarkBlue'),  bg: '#020d1a', accent: '#5aadff', pink: '#9b6fff' },
    { id: 'green', label: t('prefs.themeDarkGreen'), bg: '#051a0d', accent: '#3dba6e', pink: '#b0d630' },
    { id: 'red',   label: t('prefs.themeDarkRed'),   bg: '#1a0302', accent: '#ff6b5a', pink: '#d6369a' },
    { id: 'light', label: t('prefs.themeLight'),     bg: '#f2f4f8', accent: '#2255cc', pink: '#7744cc' },
  ]

  return (
    <div>
      <h3>{t('prefs.theme')}</h3>
      <div className={styles.grid}>
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`${styles.swatch} ${currentTheme === t.id ? styles.active : ''}`}
            onClick={() => dispatch(setPref({ key: 'theme', data: t.id }))}
            aria-pressed={currentTheme === t.id}
          >
            <span className={styles.preview} style={{ background: t.bg }}>
              <span className={styles.bar} style={{ background: t.accent }} />
              <span className={styles.bar} style={{ background: t.pink }} />
            </span>
            <span className={styles.label}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default ThemePrefs
