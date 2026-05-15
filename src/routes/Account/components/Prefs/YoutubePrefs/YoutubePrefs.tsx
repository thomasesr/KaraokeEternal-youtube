import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import Button from 'components/Button/Button'
import { fetchYoutubeConfig, saveYoutubeConfig } from 'store/modules/youtube'
import { YOUTUBE_QUALITY_PRESETS, YOUTUBE_ENHANCED_LRC_BACKENDS } from 'shared/types'
import type { YoutubeQualityPreset, YoutubeRole, YoutubeEnhancedLrcBackend } from 'shared/types'

import styles from './YoutubePrefs.css'

const YoutubePrefs = () => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  const ROLE_LABEL: Record<Exclude<YoutubeRole, 'admin'>, { label: string, hint: string }> = {
    room_manager: { label: t('prefs.ytRoleManagers'), hint: t('prefs.ytRoleManagersHint') },
    standard:     { label: t('prefs.ytRoleReturning'), hint: t('prefs.ytRoleReturningHint') },
    guest:        { label: t('prefs.ytRoleGuests'), hint: t('prefs.ytRoleGuestsHint') },
  }

  const QUALITY_LABEL: Record<YoutubeQualityPreset, string> = {
    best: t('prefs.ytQualityBest'),
    '1080p': '1080p (Full HD)',
    '720p': '720p (HD)',
    '480p': '480p (SD)',
    '360p': '360p (low)',
  }

  const ENHANCED_LRC_LABEL: Record<YoutubeEnhancedLrcBackend, string> = {
    none: t('prefs.ytQualityDisabled'),
    ctc: 'ctc-forced-aligner (word-level timestamps)',
  }
  const config = useAppSelector(state => state.youtube.config)
  const isConfigLoaded = useAppSelector(state => state.youtube.isConfigLoaded)
  const isSaving = useAppSelector(state => state.youtube.isSaving)
  const saveError = useAppSelector(state => state.youtube.saveError)
  const paths = useAppSelector(state => state.prefs.paths)

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [cookies, setCookies] = useState('')

  useEffect(() => {
    if (!isConfigLoaded) dispatch(fetchYoutubeConfig())
  }, [dispatch, isConfigLoaded])

  if (!isConfigLoaded || !config) {
    return (
      <Accordion headingComponent={(
        <div className={styles.heading}>
          <Icon icon='YOUTUBE' />
          <div>YouTube</div>
        </div>
      )}
      >
        <div className={styles.content}>Loading…</div>
      </Accordion>
    )
  }

  const handleToggleEnabled = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(saveYoutubeConfig({ isEnabled: e.currentTarget.checked }))
  }

  const handleToggleCookies = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(saveYoutubeConfig({ useCookies: e.currentTarget.checked }))
  }

  const handleToggleRole = (role: Exclude<YoutubeRole, 'admin'>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!config) return
    const current = new Set<YoutubeRole>(config.allowedRoles)
    if (e.currentTarget.checked) current.add(role)
    else current.delete(role)
    current.add('admin')
    dispatch(saveYoutubeConfig({ allowedRoles: Array.from(current) as YoutubeRole[] }))
  }

  const handlePathChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.currentTarget.value
    dispatch(saveYoutubeConfig({ downloadPathId: v === '' ? null : parseInt(v, 10) }))
  }

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(saveYoutubeConfig({ qualityPreset: e.currentTarget.value as YoutubeQualityPreset }))
  }

  const handleEnhancedLrcChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    dispatch(saveYoutubeConfig({ enhancedLrcBackend: e.currentTarget.value as YoutubeEnhancedLrcBackend }))
  }

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.currentTarget.value, 10)
    if (Number.isFinite(v) && v >= 0 && v <= 100) {
      dispatch(saveYoutubeConfig({ musicbrainzMinScore: v }))
    }
  }

  const handleSaveKey = () => {
    if (!apiKey.trim()) return
    dispatch(saveYoutubeConfig({ apiKey: apiKey.trim() }))
    setApiKey('')
  }

  const handleClearKey = () => {
    if (!confirm(t('prefs.ytClearApiKey'))) return
    dispatch(saveYoutubeConfig({ apiKey: null }))
    setApiKey('')
  }

  const handleSaveCookies = () => {
    if (!cookies.trim()) return
    dispatch(saveYoutubeConfig({ cookies }))
    setCookies('')
  }

  const handleClearCookies = () => {
    if (!confirm(t('prefs.ytClearCookies'))) return
    dispatch(saveYoutubeConfig({ cookies: null }))
    setCookies('')
  }

  return (
    <Accordion headingComponent={(
      <div className={styles.heading}>
        <Icon icon='YOUTUBE' />
        <div>YouTube</div>
      </div>
    )}
    >
      <div className={styles.content}>
        <label className={styles.toggleRow}>
          <input
            type='checkbox'
            checked={config.isEnabled}
            onChange={handleToggleEnabled}
            disabled={isSaving}
          />
          {t('prefs.ytEnableSearch')}
        </label>

        <div className={styles.row}>
          <label>{t('prefs.ytWhoCanSearch')}</label>
          <label className={styles.toggleRow} style={{ padding: 0 }}>
            <input type='checkbox' checked disabled />
            {t('prefs.ytAdminsAlways')}
          </label>
          {(['room_manager', 'standard', 'guest'] as const).map(role => (
            <label key={role} className={styles.toggleRow} style={{ padding: 0 }}>
              <input
                type='checkbox'
                checked={config.allowedRoles.includes(role)}
                onChange={handleToggleRole(role)}
                disabled={isSaving}
              />
              <span>
                {ROLE_LABEL[role].label}
                <span className={styles.note} style={{ marginLeft: 'var(--space-s)' }}>
                  {ROLE_LABEL[role].hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-pathId'>{t('prefs.ytDownloadPath')}</label>
          <select
            id='yt-pathId'
            value={config.downloadPathId ?? ''}
            onChange={handlePathChange}
            disabled={isSaving || paths.result.length === 0}
          >
            <option value=''>{t('prefs.ytSelectFolder')}</option>
            {paths.result.map((pathId) => {
              const p = paths.entities[pathId]
              return (
                <option key={pathId} value={pathId}>{p.path}</option>
              )
            })}
          </select>
          {paths.result.length === 0 && (
            <div className={styles.note}>{t('prefs.ytAddFolderFirst')}</div>
          )}
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-quality'>{t('prefs.ytQuality')}</label>
          <select
            id='yt-quality'
            value={config.qualityPreset}
            onChange={handleQualityChange}
            disabled={isSaving}
          >
            {YOUTUBE_QUALITY_PRESETS.map(p => (
              <option key={p} value={p}>{QUALITY_LABEL[p]}</option>
            ))}
          </select>
          <div className={styles.note}>{t('prefs.ytQualityNote')}</div>
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-enhancedLrc'>{t('prefs.ytEnhancedLrc')}</label>
          <select
            id='yt-enhancedLrc'
            value={config.enhancedLrcBackend ?? 'none'}
            onChange={handleEnhancedLrcChange}
            disabled={isSaving}
          >
            {YOUTUBE_ENHANCED_LRC_BACKENDS.map(b => (
              <option key={b} value={b}>{ENHANCED_LRC_LABEL[b]}</option>
            ))}
          </select>
          <div className={styles.note}>
            {t('prefs.ytEnhancedLrcNote1')}
            <code>ctc-forced-aligner</code>
            {t('prefs.ytEnhancedLrcNote2')}
            <code>CTC_USE_GPU=1</code>
            {t('prefs.ytEnhancedLrcNote3')}
          </div>
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-mbScore'>
            {t('prefs.ytMbScoreLabel', { score: config.musicbrainzMinScore })}
          </label>
          <input
            id='yt-mbScore'
            type='range'
            min={0}
            max={100}
            step={1}
            value={config.musicbrainzMinScore}
            onChange={handleScoreChange}
            disabled={isSaving}
          />
          <div className={styles.note}>{t('prefs.ytMbScoreNote')}</div>
        </div>

        <label className={styles.toggleRow}>
          <input
            type='checkbox'
            checked={config.useCookies}
            onChange={handleToggleCookies}
            disabled={isSaving}
          />
          {t('prefs.ytUseCookies')}
        </label>

        <div className={styles.row}>
          <label htmlFor='yt-apiKey'>
            {t('prefs.ytApiKeyLabel')}
            {config.isApiKeyConfigured && (
              <span className={styles.lockedBadge}>
                {config.isApiKeyFromEnv ? t('prefs.ytSetViaEnv') : t('prefs.ytConfigured')}
              </span>
            )}
          </label>
          {config.isApiKeyFromEnv
            ? (
                <div className={styles.note}>
                  {t('prefs.ytApiKeyEnvNote')}
                </div>
              )
            : (
                <>
                  <input
                    id='yt-apiKey'
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.currentTarget.value)}
                    placeholder={config.isApiKeyConfigured ? t('prefs.ytApiKeyReplacePlaceholder') : t('prefs.ytApiKeyPlaceholder')}
                    autoComplete='off'
                    disabled={isSaving}
                  />
                  <div className={styles.btnRow}>
                    <Button
                      onClick={handleSaveKey}
                      variant='primary'
                      disabled={isSaving || !apiKey.trim()}
                    >
                      {t('prefs.ytSaveKey')}
                    </Button>
                    <Button
                      onClick={() => setShowKey(s => !s)}
                      variant='default'
                    >
                      {showKey ? t('prefs.ytHide') : t('prefs.ytShow')}
                    </Button>
                    {config.isApiKeyConfigured && (
                      <Button
                        onClick={handleClearKey}
                        variant='default'
                        disabled={isSaving}
                      >
                        {t('common.clear')}
                      </Button>
                    )}
                  </div>
                </>
              )}
          {saveError && <div className={styles.error}>{saveError}</div>}
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-cookies'>
            {t('prefs.ytCookiesLabel')}
            {config.isCookiesConfigured && (
              <span className={styles.lockedBadge}>{t('prefs.ytConfigured')}</span>
            )}
          </label>
          <textarea
            id='yt-cookies'
            rows={6}
            value={cookies}
            onChange={e => setCookies(e.currentTarget.value)}
            placeholder={config.isCookiesConfigured
              ? t('prefs.ytCookiesReplacePlaceholder')
              : t('prefs.ytCookiesPlaceholder')}
            disabled={isSaving}
            spellCheck={false}
            autoComplete='off'
          />
          <div className={styles.note}>{t('prefs.ytCookiesNote')}</div>
          <div className={styles.btnRow}>
            <Button
              onClick={handleSaveCookies}
              variant='primary'
              disabled={isSaving || !cookies.trim()}
            >
              {t('prefs.ytSaveCookies')}
            </Button>
            {config.isCookiesConfigured && (
              <Button
                onClick={handleClearCookies}
                variant='default'
                disabled={isSaving}
              >
                {t('common.clear')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Accordion>
  )
}

export default YoutubePrefs
