import React, { useEffect, useRef } from 'react'
import styles from './CommercialPlayer.css'

interface CommercialPlayerProps {
  roomId: number
  onEnded: () => void
  onError: () => void
}

const CommercialPlayer = ({ roomId, onEnded, onError }: CommercialPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => {
      const v = videoRef.current
      if (v) {
        v.pause()
        v.src = ''
      }
    }
  }, [])

  return (
    <video
      ref={videoRef}
      className={styles.video}
      src={`${document.baseURI}api/commercial?roomId=${roomId}`}
      autoPlay
      playsInline
      onEnded={onEnded}
      onError={onError}
    />
  )
}

export default CommercialPlayer
