import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import Button from 'components/Button/Button'
import { fetchYoutubeConfig, saveYoutubeConfig } from 'store/modules/youtube'
import { YOUTUBE_QUALITY_PRESETS } from 'shared/types'
import type { YoutubeQualityPreset, YoutubeRole } from 'shared/types'

const ROLE_LABEL: Record<Exclude<YoutubeRole, 'admin'>, { label: string, hint: string }> = {
  room_manager: {
    label: 'Room managers',
    hint: 'Hosts who manage one or more rooms (rotation, status, etc.).',
  },
  standard: {
    label: 'Returning users',
    hint: 'Signed-in accounts with a username and password.',
  },
  guest: {
    label: 'Guests',
    hint: 'Users who joined a room without an account.',
  },
}

const QUALITY_LABEL: Record<YoutubeQualityPreset, string> = {
  best: 'Best available',
  '1080p': '1080p (Full HD)',
  '720p': '720p (HD)',
  '480p': '480p (SD)',
  '360p': '360p (low)',
}
import styles from './YoutubePrefs.css'

const YoutubePrefs = () => {
  const dispatch = useAppDispatch()
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
    if (!confirm('Clear the YouTube API key?')) return
    dispatch(saveYoutubeConfig({ apiKey: null }))
    setApiKey('')
  }

  const handleSaveCookies = () => {
    if (!cookies.trim()) return
    dispatch(saveYoutubeConfig({ cookies }))
    setCookies('')
  }

  const handleClearCookies = () => {
    if (!confirm('Clear stored YouTube cookies.txt?')) return
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
          Enable YouTube search
        </label>

        <div className={styles.row}>
          <label>Who can search and download</label>
          <label className={styles.toggleRow} style={{ padding: 0 }}>
            <input type='checkbox' checked disabled />
            Admins (always)
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
          <label htmlFor='yt-pathId'>Download into media folder</label>
          <select
            id='yt-pathId'
            value={config.downloadPathId ?? ''}
            onChange={handlePathChange}
            disabled={isSaving || paths.result.length === 0}
          >
            <option value=''>— select a media folder —</option>
            {paths.result.map((pathId) => {
              const p = paths.entities[pathId]
              return (
                <option key={pathId} value={pathId}>{p.path}</option>
              )
            })}
          </select>
          {paths.result.length === 0 && (
            <div className={styles.note}>Add a media folder first under “Media Folders”.</div>
          )}
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-quality'>Default download quality</label>
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
          <div className={styles.note}>
            Caps the resolution selected by yt-dlp. Lower = smaller files, faster downloads.
          </div>
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-mbScore'>
            MusicBrainz minimum match score:
            {' '}
            {config.musicbrainzMinScore}
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
          <div className={styles.note}>
            Below this score, the user is prompted to confirm the artist + song title before download.
            Higher = stricter (more prompts); lower = trust MusicBrainz more.
          </div>
        </div>

        <label className={styles.toggleRow}>
          <input
            type='checkbox'
            checked={config.useCookies}
            onChange={handleToggleCookies}
            disabled={isSaving}
          />
          Use cookies for yt-dlp (age-gated content)
        </label>

        <div className={styles.row}>
          <label htmlFor='yt-apiKey'>
            YouTube Data API key
            {config.isApiKeyConfigured && (
              <span className={styles.lockedBadge}>
                {config.isApiKeyFromEnv ? 'set via env' : 'configured'}
              </span>
            )}
          </label>
          {config.isApiKeyFromEnv
            ? (
                <div className={styles.note}>
                  The key is provided by the
                  {' '}
                  <code>KES_YOUTUBE_API_KEY</code>
                  {' '}
                  environment variable and cannot be changed at runtime.
                </div>
              )
            : (
                <>
                  <input
                    id='yt-apiKey'
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.currentTarget.value)}
                    placeholder={config.isApiKeyConfigured ? 'Replace existing key…' : 'Paste your key here'}
                    autoComplete='off'
                    disabled={isSaving}
                  />
                  <div className={styles.btnRow}>
                    <Button
                      onClick={handleSaveKey}
                      variant='primary'
                      disabled={isSaving || !apiKey.trim()}
                    >
                      Save key
                    </Button>
                    <Button
                      onClick={() => setShowKey(s => !s)}
                      variant='default'
                    >
                      {showKey ? 'Hide' : 'Show'}
                    </Button>
                    {config.isApiKeyConfigured && (
                      <Button
                        onClick={handleClearKey}
                        variant='default'
                        disabled={isSaving}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </>
              )}
          {saveError && <div className={styles.error}>{saveError}</div>}
        </div>

        <div className={styles.row}>
          <label htmlFor='yt-cookies'>
            Cookies (Netscape format, used by yt-dlp)
            {config.isCookiesConfigured && (
              <span className={styles.lockedBadge}>configured</span>
            )}
          </label>
          <textarea
            id='yt-cookies'
            rows={6}
            value={cookies}
            onChange={e => setCookies(e.currentTarget.value)}
            placeholder={config.isCookiesConfigured
              ? 'Paste replacement cookies.txt contents…'
              : 'Paste contents of cookies.txt here'}
            disabled={isSaving}
            spellCheck={false}
            autoComplete='off'
          />
          <div className={styles.note}>
            Export with a browser extension that emits Netscape-format
            {' '}
            <code>cookies.txt</code>
            . Required only for age-gated or region-locked videos. Enable
            {' '}
            “Use cookies for yt-dlp” above to send them with downloads.
          </div>
          <div className={styles.btnRow}>
            <Button
              onClick={handleSaveCookies}
              variant='primary'
              disabled={isSaving || !cookies.trim()}
            >
              Save cookies
            </Button>
            {config.isCookiesConfigured && (
              <Button
                onClick={handleClearCookies}
                variant='default'
                disabled={isSaving}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </Accordion>
  )
}

export default YoutubePrefs
