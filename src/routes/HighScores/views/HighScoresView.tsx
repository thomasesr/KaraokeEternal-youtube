import React, { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { fetchHighScores } from 'store/modules/highScores'
import HighScoresList from '../components/HighScoresList/HighScoresList'
import Spinner from 'components/Spinner/Spinner'
import styles from './HighScoresView.css'

const HighScoresView = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { headerHeight, footerHeight, innerWidth, innerHeight } = useAppSelector(state => state.ui)
  const { todaySongs, todayUsers, allTimeUsers, isLoading } = useAppSelector(state => state.highScores)

  useEffect(() => {
    dispatch(fetchHighScores())
  }, [dispatch])

  return (
    <div
      className={styles.container}
      style={{
        paddingTop: headerHeight,
        paddingBottom: footerHeight,
        width: innerWidth,
        minHeight: innerHeight,
      }}
    >
      <h1 className={styles.pageTitle}>{t('highScores.title')}</h1>

      {isLoading && <Spinner />}

      {!isLoading && (
        <>
          <HighScoresList
            title={t('highScores.todaySongs')}
            rows={todaySongs}
            type='songs'
            noScoresText={t('highScores.noScores')}
          />
          <HighScoresList
            title={t('highScores.todayUsers')}
            rows={todayUsers}
            type='users'
            noScoresText={t('highScores.noScores')}
          />
          <HighScoresList
            title={t('highScores.allTimeUsers')}
            rows={allTimeUsers}
            type='users'
            noScoresText={t('highScores.noScores')}
          />
        </>
      )}
    </div>
  )
}

export default HighScoresView
