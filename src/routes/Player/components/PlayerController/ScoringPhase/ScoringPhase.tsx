import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './ScoringPhase.css'

interface ScoringPhaseProps {
  isActive: boolean
  endsAt: number | null
  result: number | null
  wasSkipped: boolean
  width: number
  height: number
  onAnimationComplete: () => void
}

const HOLD_MS = 4000

const ScoringPhase = ({
  isActive,
  endsAt,
  result,
  wasSkipped,
  width,
  height,
  onAnimationComplete,
}: ScoringPhaseProps) => {
  const { t } = useTranslation()
  const [countdown, setCountdown] = useState<number | null>(null)
  const [starsDone, setStarsDone] = useState(false)

  // countdown tick during voting window
  useEffect(() => {
    if (!isActive || !endsAt) return

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      setCountdown(remaining)
    }

    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [isActive, endsAt])

  // skip / zero-result: call onAnimationComplete immediately
  useEffect(() => {
    if (!isActive && result !== null && (wasSkipped || result === 0)) {
      onAnimationComplete()
    }
  }, [isActive, result, wasSkipped, onAnimationComplete])

  // hold stars on screen for HOLD_MS after last star finishes animating
  useEffect(() => {
    if (!starsDone) return
    const id = setTimeout(onAnimationComplete, HOLD_MS)
    return () => clearTimeout(id)
  }, [starsDone, onAnimationComplete])

  const starsToShow = (!isActive && result !== null && !wasSkipped && result > 0)
    ? Math.ceil(result)
    : 0

  return (
    <div className={styles.container} style={{ width, height }}>
      {isActive && (
        <div className={styles.tallying}>
          <div className={styles.tallyingText}>{t('player.scoringTallying')}</div>
          {countdown !== null && (
            <div className={styles.countdown}>{countdown}</div>
          )}
        </div>
      )}
      {starsToShow > 0 && (
        <div className={styles.stars}>
          {Array.from({ length: starsToShow }, (_, i) => (
            <svg
              key={i}
              className={styles.star}
              style={{ animationDelay: `${i * 0.25}s` }}
              viewBox='0 0 32 32'
              aria-hidden
              onAnimationEnd={i === starsToShow - 1 ? () => setStarsDone(true) : undefined}
            >
              <path d='M32 12.408l-11.056-1.607-4.944-10.018-4.944 10.018-11.056 1.607 8 7.798-1.889 11.011 9.889-5.199 9.889 5.199-1.889-11.011 8-7.798z' />
            </svg>
          ))}
        </div>
      )}
    </div>
  )
}

export default ScoringPhase
