import React from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import Slider from 'components/Slider/Slider'
import { setPref } from 'store/modules/prefs'
import styles from './PlayerPrefs.css'

const PlayerPrefs = () => {
  const isReplayGainEnabled = useAppSelector(state => state.prefs.isReplayGainEnabled)
  const lrcDefaultOffset = useAppSelector(state => state.prefs.lrcDefaultOffset)
  const lrcFontSize = useAppSelector(state => state.prefs.lrcFontSize ?? 1)
  const dispatch = useAppDispatch()

  const toggleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setPref({ key: e.currentTarget.name, data: e.currentTarget.checked }))
  }

  const handleLrcDefaultOffset = (val: number) => {
    dispatch(setPref({ key: 'lrcDefaultOffset', data: val }))
  }

  const handleLrcFontSize = (val: number) => {
    dispatch(setPref({ key: 'lrcFontSize', data: val }))
  }

  return (
    <Accordion
      className={styles.container}
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='TELEVISION_PLAY' size={32} className={styles.icon} />
          <div className={styles.title}>Player</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <label>
          <input
            type='checkbox'
            checked={isReplayGainEnabled}
            onChange={toggleCheckbox}
            name='isReplayGainEnabled'
          />
          {' '}
          ReplayGain (clip-safe)
        </label>
        <div className={styles.field}>
          <label id='label-lrc-default-offset'>
            Default LRC offset ({lrcDefaultOffset > 0 ? '+' : ''}{lrcDefaultOffset} ms)
          </label>
          <Slider
            min={-1000}
            max={1000}
            step={10}
            value={lrcDefaultOffset}
            onChange={handleLrcDefaultOffset}
            className={styles.slider}
            aria-labelledby='label-lrc-default-offset'
          />
        </div>
        <div className={styles.field}>
          <label id='label-lrc-font-size'>
            LRC lyrics size ({Math.round(lrcFontSize * 100)}%)
          </label>
          <Slider
            min={0.5}
            max={2}
            step={0.05}
            value={lrcFontSize}
            onChange={handleLrcFontSize}
            className={styles.slider}
            aria-labelledby='label-lrc-font-size'
          />
        </div>
      </div>
    </Accordion>
  )
}

export default PlayerPrefs
