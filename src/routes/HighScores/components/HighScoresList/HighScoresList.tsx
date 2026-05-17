import React from 'react'
import { useTranslation } from 'react-i18next'
import Icon from 'components/Icon/Icon'
import styles from './HighScoresList.css'

interface SongRow {
  songId: number
  avgScore: number
  timesPlayed: number
  title: string
  artistName: string
  singerName: string | null
}

interface UserRow {
  userId: number
  name: string
  totalScore: number
  songCount: number
}

interface HighScoresListProps {
  title: string
  rows: (SongRow | UserRow)[]
  type: 'songs' | 'users'
  noScoresText: string
}

function isSongRow (row: SongRow | UserRow): row is SongRow {
  return 'title' in row
}

const StarDisplay = ({ score }: { score: number }) => {
  const filled = Math.round(score)
  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => (
        <Icon
          key={i}
          icon='STAR_FULL'
          className={i < filled ? styles.starFilled : styles.starEmpty}
        />
      ))}
      <span className={styles.scoreNum}>{score.toFixed(1)}</span>
    </span>
  )
}

const HighScoresList = ({ title, rows, type, noScoresText }: HighScoresListProps) => {
  const { t } = useTranslation()

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>{noScoresText}</p>
      ) : (
        <ol className={styles.list}>
          {rows.map((row, i) => (
            <li key={isSongRow(row) ? row.songId : row.userId} className={styles.row}>
              <span className={styles.rank}>{i + 1}</span>
              {isSongRow(row) ? (
                <>
                  <span className={styles.primary}>
                    <span className={styles.name}>{row.title}</span>
                    <span className={styles.sub}>
                      {row.artistName}{row.singerName ? ` · ${row.singerName}` : ''}
                    </span>
                  </span>
                  <span className={styles.meta}>
                    <StarDisplay score={row.avgScore} />
                    <span className={styles.plays}>
                      {t('highScores.timesPlayed', { count: row.timesPlayed })}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className={styles.primary}>
                    <span className={styles.name}>{row.name}</span>
                    <span className={styles.sub}>
                      {t('highScores.songCount', { count: row.songCount })}
                    </span>
                  </span>
                  <span className={styles.meta}>
                    <span className={styles.totalScore}>{row.totalScore.toFixed(1)} pts</span>
                  </span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default HighScoresList
