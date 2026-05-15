import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useAppSelector } from 'store/hooks'

export default function usePwaRoom (): void {
  const userRoomId = useAppSelector(state => state.user.roomId)
  const rooms = useAppSelector(state => state.rooms)
  const location = useLocation()

  useEffect(() => {
    // Priority: logged-in room → URL param → only room in list
    const urlParam = new URLSearchParams(location.search).get('roomId')
    const urlRoomId = urlParam ? parseInt(urlParam, 10) : null
    const singleRoomId = rooms.result.length === 1 ? rooms.result[0] : null

    const effectiveRoomId = userRoomId ?? urlRoomId ?? singleRoomId
    const roomName = effectiveRoomId ? rooms.entities[effectiveRoomId]?.name : undefined

    // <title>
    document.title = roomName ? `Karaoke ${roomName}` : 'Karaoke Eternal'

    // <link rel="manifest">
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (manifestLink) {
      manifestLink.href = new URL(
        effectiveRoomId ? `manifest.json?roomId=${effectiveRoomId}` : 'manifest.json',
        document.baseURI,
      ).href
    }

    // iOS <meta name="apple-mobile-web-app-title">
    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (appleTitle) {
      appleTitle.content = roomName ?? 'KaraokeEternal'
    }
  }, [userRoomId, rooms, location.search])
}
