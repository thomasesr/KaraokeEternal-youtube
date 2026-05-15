import React from 'react'
import { useTranslation } from 'react-i18next'
import clsx from 'clsx'
import Modal, { ModalProps } from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import Slider from 'components/Slider/Slider'
import Icon from 'components/Icon/Icon'
import styles from './DisplayCtrl.css'
import { MediaType, PlaybackOptions } from 'shared/types'

interface DisplayCtrlProps {
  cdgAlpha: number
  cdgSize: number
  isVideoKeyingEnabled: boolean
  isVisualizerEnabled: boolean
  isWebGLSupported: boolean
  lrcFontSize: number
  lrcOffset: number
  lrcSmoothScroll: boolean
  mediaType?: MediaType
  mp4Alpha: number
  sensitivity: number
  visualizerPresetName: string
  // actions
  onRequestOptions(opts: PlaybackOptions): void
  onClose: ModalProps['onClose']
}

const DisplayCtrl = ({
  cdgAlpha,
  cdgSize,
  isVideoKeyingEnabled,
  isVisualizerEnabled,
  isWebGLSupported,
  lrcFontSize,
  lrcOffset,
  lrcSmoothScroll,
  mediaType = '',
  mp4Alpha,
  sensitivity,
  visualizerPresetName,
  onRequestOptions,
  onClose,
}: DisplayCtrlProps) => {
  const { t } = useTranslation()

  const handleAlpha = (val: number) => {
    if (mediaType === 'cdg' || mediaType === 'lrc') onRequestOptions({ cdgAlpha: val })
    else if (mediaType === 'mp4' || isVideoKeyingEnabled) onRequestOptions({ mp4Alpha: val })
  }

  const handleSensitivity = (val: number) => onRequestOptions({
    visualizer: { sensitivity: val },
  })

  const handleSize = (val: number) => {
    onRequestOptions({ cdgSize: val })
  }

  const handleToggleVisualizer = () => onRequestOptions({
    visualizer: { isEnabled: !isVisualizerEnabled },
  })

  const handlePresetNext = () => onRequestOptions({
    visualizer: { nextPreset: true },
  })

  const handlePresetPrev = () => onRequestOptions({
    visualizer: { prevPreset: true },
  })

  const handlePresetRandom = () => onRequestOptions({
    visualizer: { randomPreset: true },
  })

  const handleLrcSmoothScroll = () => onRequestOptions({ lrcSmoothScroll: !lrcSmoothScroll })
  const handleLrcOffset = (val: number) => onRequestOptions({ lrcOffset: val })
  const handleLrcFontSize = (val: number) => onRequestOptions({ lrcFontSize: val })

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={t('display.display')}
      buttons={<Button variant='primary' onClick={onClose}>Done</Button>}
    >
      <div className={styles.container}>
        <div className={clsx(styles.section, styles.visualizer)}>
          <fieldset>
            <legend>
              <InputCheckbox
                label={t('display.visualizer')}
                checked={isVisualizerEnabled}
                disabled={!isWebGLSupported}
                onChange={handleToggleVisualizer}
              />
            </legend>

            {isWebGLSupported && (mediaType === 'cdg' || mediaType === 'lrc' || isVideoKeyingEnabled) && (
              <>
                <div className={styles.presetContainer}>
                  <div className={styles.presetButtons}>
                    <Button
                      onClick={handlePresetPrev}
                      aria-label={t('display.prevPreset')}
                      aria-controls='visualizer-preset-name'
                    >
                      <Icon icon='CHEVRON_LEFT' />
                    </Button>
                    <Button
                      onClick={handlePresetRandom}
                      aria-label={t('display.randomPreset')}
                      aria-controls='visualizer-preset-name'
                    >
                      <Icon icon='DICE' />
                    </Button>
                    <Button
                      onClick={handlePresetNext}
                      aria-label={t('display.nextPreset')}
                      aria-controls='visualizer-preset-name'
                    >
                      <Icon icon='CHEVRON_RIGHT' />
                    </Button>
                  </div>
                  <p
                    id='visualizer-preset-name'
                    className={styles.presetName}
                    aria-live='polite'
                    translate='no'
                  >
                    {visualizerPresetName}
                  </p>
                </div>

                <div className={styles.field}>
                  <label id='label-visualizer-sensitivity'>{t('display.sensitivity')}</label>
                  <Slider
                    min={0}
                    max={2}
                    step={0.01}
                    value={sensitivity}
                    onChange={handleSensitivity}
                    className={styles.slider}
                    aria-labelledby='label-visualizer-sensitivity'
                  />
                </div>
              </>
            )}

            {isWebGLSupported && mediaType !== 'cdg' && mediaType !== 'lrc' && !isVideoKeyingEnabled
              && <p className={styles.unsupported}>Not available for this media type</p>}

            {!isWebGLSupported
              && <p className={styles.unsupported}>WebGL not supported</p>}
          </fieldset>
        </div>

        <div className={clsx(styles.section, styles.lyrics)}>
          <fieldset>
            <legend>
              <label>{t('display.lyrics')}</label>
            </legend>

            {mediaType === 'cdg' && (
              <div className={styles.field}>
                <label id='label-lyrics-size'>{t('display.lyricsSize')}</label>
                <Slider
                  min={0.4}
                  max={0.9}
                  step={0.01}
                  value={cdgSize}
                  onChange={handleSize}
                  className={styles.slider}
                  aria-labelledby='label-lyrics-size'
                />
              </div>
            )}

            {(mediaType === 'cdg' || mediaType === 'lrc' || isVideoKeyingEnabled) && (
              <div className={styles.field}>
                <label id='label-lyrics-background'>{t('display.background')}</label>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={(mediaType === 'cdg' || mediaType === 'lrc') ? cdgAlpha : mp4Alpha}
                  onChange={handleAlpha}
                  className={styles.slider}
                  aria-labelledby='label-lyrics-background'
                />
              </div>
            )}

            {mediaType === 'lrc' && (
              <>
                <div className={styles.field}>
                  <label id='label-lrc-font-size'>{t('prefs.lrcFontSize', { size: Math.round(lrcFontSize * 100) })}</label>
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
                <div className={styles.field}>
                  <InputCheckbox
                    label={t('display.smoothScroll')}
                    checked={lrcSmoothScroll}
                    onChange={handleLrcSmoothScroll}
                  />
                </div>
                <div className={styles.field}>
                  <label id='label-lrc-offset'>{t('prefs.lrcOffset', { offset: lrcOffset > 0 ? `+${lrcOffset}` : lrcOffset })}</label>
                  <Slider
                    min={-1000}
                    max={1000}
                    step={10}
                    value={lrcOffset}
                    onChange={handleLrcOffset}
                    className={styles.slider}
                    aria-labelledby='label-lrc-offset'
                  />
                </div>
              </>
            )}

            {mediaType !== 'cdg' && mediaType !== 'lrc' && !isVideoKeyingEnabled && (
              <p className={styles.unsupported}>No options available</p>
            )}
          </fieldset>
        </div>
      </div>
    </Modal>
  )
}

export default DisplayCtrl
