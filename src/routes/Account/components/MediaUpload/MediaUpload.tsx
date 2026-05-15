import React, { useRef, useState } from 'react'
import { useAppSelector } from 'store/hooks'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import HttpApi from 'lib/HttpApi'
import styles from './MediaUpload.css'

const api = new HttpApi('')

const MediaUpload = () => {
  const managedPathId = useAppSelector(state => state.user.managedPathId)
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  if (!managedPathId) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const files = Array.from(fileRef.current?.files ?? [])

    if (!files.length) return

    const body = new FormData()

    for (const file of files) {
      body.append('file', file)
    }

    setStatus('uploading')
    setMessage('')

    try {
      const res = await api.post('upload', { body }) as {
        zipTypes: string[] | null
        extractedCount: number
      }
      const detail = res.zipTypes
        ? `ZIP (${res.zipTypes.join(', ')}): ${res.extractedCount} files extracted`
        : `${files.length} file${files.length > 1 ? 's' : ''} uploaded`
      setMessage(detail + ' — scan started')
      setStatus('done')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      setMessage(err.message ?? 'Upload failed')
      setStatus('error')
    }
  }

  return (
    <Panel title='Upload Media'>
      <form onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.hint}>
          Upload karaoke media files (mp3+cdg, mp3+lrc, mp4, audio-only mp3) or ZIP archives.
          Files will be added to your managed folder.
        </p>
        <input
          ref={fileRef}
          type='file'
          accept='.mp3,.cdg,.lrc,.mp4,.flac,.wav,.m4a,.zip'
          multiple
          className={styles.input}
        />
        {status === 'uploading' && <div className={styles.status}>Uploading…</div>}
        {status === 'done' && <div className={styles.statusOk}>{message}</div>}
        {status === 'error' && <div className={styles.statusErr}>{message}</div>}
        <Button type='submit' variant='primary' disabled={status === 'uploading'}>
          Upload
        </Button>
      </form>
    </Panel>
  )
}

export default MediaUpload
