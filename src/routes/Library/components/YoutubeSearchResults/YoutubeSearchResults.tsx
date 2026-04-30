import React, { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Spinner from 'components/Spinner/Spinner'
import Button from 'components/Button/Button'
import { youtubeDownloadStart, youtubeDownloadStatus, youtubeIdentify } from 'store/modules/youtube'
import styles from './YoutubeSearchResults.css'

interface Props {
  paddingTop: number
  paddingBottom: number
  height: number
}

interface ModalState {
  videoId: string
  artist: string
  title: string
  reason: 'miss' | 'lowScore'
  score: number | null
  busy: boolean
  error: string | null
}

function formatDuration (sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const YoutubeSearchResults = ({ paddingTop, paddingBottom, height }: Props) => {
  const dispatch = useAppDispatch()
  const { isSearching, searchError, searchQuery, searchResults, downloads, access } = useAppSelector(state => state.youtube)
  const downloadPathConfigured = !!access?.downloadPathConfigured
  const pollRef = useRef<number | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [identifyingId, setIdentifyingId] = useState<string | null>(null)

  const activeIds = Object.values(downloads)
    .filter(j => j.status === 'queued' || j.status === 'downloading')
    .map(j => j.videoId)
  const activeKey = activeIds.join(',')

  useEffect(() => {
    if (!activeKey) return
    const tick = () => {
      for (const id of activeKey.split(',')) {
        if (id) dispatch(youtubeDownloadStatus(id))
      }
    }
    pollRef.current = window.setInterval(tick, 1500)
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [activeKey, dispatch])

  const startDownload = (videoId: string, artist: string, title: string) => {
    dispatch(youtubeDownloadStart({ videoId, artist, title }))
  }

  const onDownload = async (videoId: string, videoTitle: string) => {
    setIdentifyingId(videoId)
    try {
      const action = await dispatch(youtubeIdentify({ title: videoTitle }))
      if (youtubeIdentify.fulfilled.match(action)) {
        const r = action.payload
        if (r.found && r.artist && r.title) {
          startDownload(videoId, r.artist, r.title)
        } else {
          setModal({
            videoId,
            artist: '',
            title: videoTitle,
            reason: r.score != null ? 'lowScore' : 'miss',
            score: r.score ?? null,
            busy: false,
            error: null,
          })
        }
      } else {
        setModal({
          videoId, artist: '', title: videoTitle,
          reason: 'miss', score: null, busy: false,
          error: action.error.message ?? 'Lookup failed',
        })
      }
    } finally {
      setIdentifyingId(null)
    }
  }

  const onModalConfirm = async () => {
    if (!modal) return
    const artist = modal.artist.trim()
    const title = modal.title.trim()
    if (!artist || !title) return

    setModal({ ...modal, busy: true, error: null })
    const action = await dispatch(youtubeIdentify({ title, artist }))
    let finalArtist = artist
    let finalTitle = title
    if (youtubeIdentify.fulfilled.match(action) && action.payload.found
      && action.payload.artist && action.payload.title) {
      finalArtist = action.payload.artist
      finalTitle = action.payload.title
    }
    startDownload(modal.videoId, finalArtist, finalTitle)
    setModal(null)
  }

  const containerStyle: React.CSSProperties = {
    paddingTop,
    paddingBottom,
    height,
    boxSizing: 'border-box',
  }

  if (isSearching) {
    return (
      <div className={styles.container} style={containerStyle}>
        <Spinner />
      </div>
    )
  }

  if (searchError) {
    return (
      <div className={styles.container} style={containerStyle}>
        <div className={styles.error}>{searchError}</div>
      </div>
    )
  }

  if (!searchQuery) {
    return (
      <div className={styles.container} style={containerStyle}>
        <div className={styles.message}>Type a query and tap the YouTube button to search.</div>
      </div>
    )
  }

  if (searchResults.length === 0) {
    return (
      <div className={styles.container} style={containerStyle}>
        <div className={styles.message}>
          No YouTube results for “
          {searchQuery}
          ”.
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container} style={containerStyle}>
      <div className={styles.heading}>
        {searchResults.length}
        {' '}
        YouTube result
        {searchResults.length === 1 ? '' : 's'}
        {' '}
        for “
        {searchQuery}
        ”
      </div>

      {searchResults.map(item => (
        <div key={item.videoId} className={styles.item}>
          {item.thumbnail && (
            <img
              src={item.thumbnail}
              alt=''
              className={styles.thumb}
              loading='lazy'
            />
          )}
          <div className={styles.body}>
            <div className={styles.title}>{item.title}</div>
            <div className={styles.meta}>
              {item.channel}
              {item.duration ? ` · ${formatDuration(item.duration)}` : ''}
            </div>
            {downloads[item.videoId]?.status === 'error' && (
              <div className={styles.error}>{downloads[item.videoId].error}</div>
            )}
            <div className={styles.actions}>
              <Button
                as='span'
                variant='default'
                onClick={() => window.open(`https://www.youtube.com/watch?v=${item.videoId}`, '_blank', 'noopener,noreferrer')}
              >
                Open on YouTube
              </Button>
              {(() => {
                const job = downloads[item.videoId]
                if (job?.status === 'downloading' || job?.status === 'queued') {
                  return (
                    <Button as='span' variant='primary' disabled>
                      {`Downloading ${Math.round(job.progress)}%`}
                    </Button>
                  )
                }
                if (job?.status === 'done') {
                  return (
                    <Button as='span' variant='default' disabled>
                      Downloaded
                    </Button>
                  )
                }
                const errTitle = job?.status === 'error' ? job.error ?? 'Download failed' : undefined
                const isIdentifying = identifyingId === item.videoId
                return (
                  <Button
                    variant='primary'
                    disabled={!downloadPathConfigured || isIdentifying}
                    title={!downloadPathConfigured ? 'Set a download path in Account → YouTube' : errTitle}
                    onClick={() => onDownload(item.videoId, item.title)}
                  >
                    {isIdentifying ? 'Identifying…' : (job?.status === 'error' ? 'Retry download' : 'Download')}
                  </Button>
                )
              })()}
            </div>
          </div>
        </div>
      ))}

      {modal && (
        <div className={styles.modalBackdrop} onClick={() => !modal.busy && setModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeading}>
              {modal.reason === 'lowScore'
                ? `MusicBrainz match too weak (score ${modal.score ?? '?'}). Confirm artist + title:`
                : 'Could not auto-detect artist/title. Enter them:'}
            </div>
            <label className={styles.modalLabel}>
              Artist
              <input
                type='text'
                value={modal.artist}
                onChange={e => setModal({ ...modal, artist: e.currentTarget.value })}
                autoFocus
                disabled={modal.busy}
              />
            </label>
            <label className={styles.modalLabel}>
              Song title
              <input
                type='text'
                value={modal.title}
                onChange={e => setModal({ ...modal, title: e.currentTarget.value })}
                disabled={modal.busy}
              />
            </label>
            {modal.error && <div className={styles.error}>{modal.error}</div>}
            <div className={styles.actions}>
              <Button variant='default' onClick={() => setModal(null)} disabled={modal.busy}>Cancel</Button>
              <Button
                variant='primary'
                onClick={onModalConfirm}
                disabled={modal.busy || !modal.artist.trim() || !modal.title.trim()}
              >
                {modal.busy ? 'Verifying…' : 'Download'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default YoutubeSearchResults
