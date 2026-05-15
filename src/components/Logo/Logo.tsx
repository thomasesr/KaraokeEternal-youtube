import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import styles from './Logo.css'

interface LogoProps {
  className?: string
  roomName?: string
}

const Logo = (props: LogoProps) => {
  const subtitle = props.roomName ?? 'Eternal'
  const [isFontLoaded, setIsFontLoaded] = useState(() => {
    // if the font loading API is not supported, we can't wait for it
    return typeof document !== 'undefined' && !document.fonts
  })

  useEffect(() => {
    if (document.fonts) {
      document.fonts.load('1em Beon')
        .then(() => {
          setIsFontLoaded(true)
          return true
        })
        .catch(() => {
          setIsFontLoaded(true)
          return false
        })
    }
  }, [])

  return (
    <div className={clsx(styles.container, props.className)} role='img' aria-label={`Karaoke ${subtitle}`}>
      <span className={styles.title} aria-hidden='true'>
        Karaoke
        <span className={clsx(styles.eternal, { [styles.eternalVisible]: isFontLoaded })}>
          {subtitle.length > 1
            ? <>{subtitle.slice(0, -1)}<span className={styles.lastChar}>{subtitle.slice(-1)}</span></>
            : <span className={styles.lastChar}>{subtitle}</span>}
        </span>
      </span>
    </div>
  )
}

export default Logo
