import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppSelector } from 'store/hooks'
import { Link } from 'react-router'
import ArtistList from '../components/ArtistList/ArtistList'
import SearchResults from '../components/SearchResults/SearchResults'
import YoutubeSearchResults from '../components/YoutubeSearchResults/YoutubeSearchResults'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import Spinner from 'components/Spinner/Spinner'
import { getVisibleSongs } from '../selectors/getSearchResults'
import styles from './LibraryView.css'

const LibraryView = () => {
  const { t } = useTranslation()
  const { isAdmin } = useAppSelector(state => state.user)
  const { isLoading, filterStr, filterStarred } = useAppSelector(state => state.library)
  const songsResult = useAppSelector(state => getVisibleSongs(state).result)
  const ui = useAppSelector(state => state.ui)
  const isYoutubeMode = useAppSelector(state => state.youtube.isModeActive)

  const isSearching = !!filterStr.trim().length || filterStarred
  const [initialHeaderHeight] = useState(ui.headerHeight)
  const [finalHeaderHeight, setFinalHeaderHeight] = useState(null)

  // don't render ArtistList until headerHeight is stable; otherwise
  // scroll position restoration does not work well (appears OBO)
  // @todo - this is hacky
  if (finalHeaderHeight === null && ui.headerHeight > initialHeaderHeight) {
    setFinalHeaderHeight(ui.headerHeight)
  }

  if (!finalHeaderHeight) return null

  return (
    <>
      {isYoutubeMode && (
        <YoutubeSearchResults
          paddingTop={ui.headerHeight}
          paddingBottom={ui.footerHeight}
          height={ui.innerHeight}
        />
      )}

      {!isYoutubeMode && !isSearching && <ArtistList ui={ui} />}

      {!isYoutubeMode && isSearching && <SearchResults ui={ui} />}

      {!isYoutubeMode && isLoading && <Spinner />}

      {!isYoutubeMode && !isLoading && songsResult.length === 0 && (
        <TextOverlay className={styles.empty}>
          <h1>{t('library.libraryEmpty')}</h1>
          {isAdmin && (
            <p>
              <Link to='/account'>{t('library.addMediaFolders')}</Link>
              {' '}
              {t('library.toGetStarted')}
            </p>
          )}
        </TextOverlay>
      )}
    </>
  )
}

export default LibraryView
