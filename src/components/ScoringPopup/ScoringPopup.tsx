import React from 'react'
import { useLocation } from 'react-router'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import ScoringWidget from 'routes/Queue/components/ScoringWidget/ScoringWidget'
import { submitVote } from 'store/modules/scoring'
import styles from './ScoringPopup.css'

// Routes where the inline queue widget is shown instead
const INLINE_SCORING_ROUTES = ['/queue', '/player']

const ScoringPopup = () => {
  const dispatch = useAppDispatch()
  const scoring = useAppSelector(state => state.scoring)
  const userId = useAppSelector(state => state.user.userId)
  const location = useLocation()

  const isInlineRoute = INLINE_SCORING_ROUTES.some(r => location.pathname.startsWith(r))

  if (!scoring.isActive || isInlineRoute || !scoring.endsAt || scoring.singerUserId == null) {
    return null
  }

  const handleVote = (score: number) => dispatch(submitVote(score))
  const handleDismiss = () => { /* auto-dismissed by ScoringWidget timer */ }

  return (
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <ScoringWidget
          endsAt={scoring.endsAt}
          singerUserId={scoring.singerUserId}
          currentUserId={userId}
          myVote={scoring.myVote}
          onVote={handleVote}
          onDismiss={handleDismiss}
        />
      </div>
    </div>
  )
}

export default ScoringPopup
