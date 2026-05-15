import React from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setPref } from 'store/modules/prefs'
import styles from './ThemePrefs.css'

const THEMES = [
  { id: 'blue',  label: 'Dark Blue',  bg: '#020d1a', accent: '#5aadff', pink: '#9b6fff' },
  { id: 'green', label: 'Dark Green', bg: '#051a0d', accent: '#3dba6e', pink: '#b0d630' },
  { id: 'red',   label: 'Dark Red',   bg: '#1a0302', accent: '#ff6b5a', pink: '#d6369a' },
  { id: 'light', label: 'Light',      bg: '#f2f4f8', accent: '#2255cc', pink: '#7744cc' },
]

const ThemePrefs = () => {
  const dispatch = useAppDispatch()
  const currentTheme = useAppSelector(state => state.prefs.theme ?? 'blue')

  return (
    <div>
      <h3>Theme</h3>
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
