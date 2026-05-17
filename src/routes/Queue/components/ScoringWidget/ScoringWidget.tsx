import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './ScoringWidget.css'

interface ScoringWidgetProps {
  endsAt: number
  singerUserId: number
  currentUserId: number
  myVote: number | null
  onVote: (score: number) => void
  onDismiss: () => void
}

const ScoringWidget = ({
  endsAt,
  singerUserId,
  currentUserId,
  myVote,
  onVote,
  onDismiss,
}: ScoringWidgetProps) => {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState<number | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // auto-dismiss when endsAt passes
  useEffect(() => {
    const delay = endsAt - Date.now()
    if (delay <= 0) { onDismiss(); return }
    dismissTimerRef.current = setTimeout(onDismiss, delay)
    return () => { if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current) }
  }, [endsAt, onDismiss])

  // singer cannot vote on their own song
  if (currentUserId === singerUserId) return null

  const displayScore = hovered ?? myVote

  const handleStarClick = (score: number) => {
    if (myVote !== null) return
    onVote(score)
  }

  const handleHalfEnter = (score: number) => setHovered(score)
  const handleLeave = () => setHovered(null)

  return (
    <div className={styles.container}>
      <div className={styles.prompt}>{t('scoring.votePrompt')}</div>
      {myVote !== null ? (
        <div className={styles.submitted}>{t('scoring.voteSubmitted')}</div>
      ) : (
        <div className={styles.stars} onMouseLeave={handleLeave}>
          {Array.from({ length: 5 }, (_, i) => {
            const fullScore = i + 1
            const halfScore = i + 0.5
            const isFilled = displayScore !== null && displayScore >= fullScore
            const isHalf = displayScore !== null && displayScore >= halfScore && displayScore < fullScore

            return (
              <span key={i} className={styles.starWrap}>
                <span
                  className={styles.halfLeft}
                  onMouseEnter={() => handleHalfEnter(halfScore)}
                  onClick={() => handleStarClick(halfScore)}
                  aria-label={t('scoring.stars', { count: halfScore })}
                />
                <span
                  className={styles.halfRight}
                  onMouseEnter={() => handleHalfEnter(fullScore)}
                  onClick={() => handleStarClick(fullScore)}
                  aria-label={t('scoring.stars', { count: fullScore })}
                />
                <svg
                  className={styles.starSvg}
                  viewBox='0 0 32 32'
                  aria-hidden
                >
                  {/* half-fill: clip left half filled, right half empty */}
                  {isHalf && (
                    <>
                      <defs>
                        <clipPath id={`half-${i}`}>
                          <rect x='0' y='0' width='16' height='32' />
                        </clipPath>
                      </defs>
                      <path
                        d='M32 12.408l-11.056-1.607-4.944-10.018-4.944 10.018-11.056 1.607 8 7.798-1.889 11.011 9.889-5.199 9.889 5.199-1.889-11.011 8-7.798z'
                        className={styles.starEmpty}
                      />
                      <path
                        d='M32 12.408l-11.056-1.607-4.944-10.018-4.944 10.018-11.056 1.607 8 7.798-1.889 11.011 9.889-5.199 9.889 5.199-1.889-11.011 8-7.798z'
                        className={styles.starFilled}
                        clipPath={`url(#half-${i})`}
                      />
                    </>
                  )}
                  {!isHalf && (
                    <path
                      d='M32 12.408l-11.056-1.607-4.944-10.018-4.944 10.018-11.056 1.607 8 7.798-1.889 11.011 9.889-5.199 9.889 5.199-1.889-11.011 8-7.798z'
                      className={isFilled ? styles.starFilled : styles.starEmpty}
                    />
                  )}
                </svg>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ScoringWidget
