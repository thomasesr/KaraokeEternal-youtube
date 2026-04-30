import React, { useEffect, useState, useRef } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setFilterStr, resetFilterStr, toggleFilterStarred } from '../../modules/library'
import { setYoutubeMode, youtubeSearch, fetchYoutubeAccess } from 'store/modules/youtube'
import Button from 'components/Button/Button'
import styles from './LibraryHeader.css'

const LibraryHeader = () => {
  const dispatch = useAppDispatch()
  const { filterStr, filterStarred } = useAppSelector(state => state.library)
  const userId = useAppSelector(state => state.user.userId)
  const ytMode = useAppSelector(state => state.youtube.isModeActive)
  const ytAccess = useAppSelector(state => state.youtube.access)
  const ytAccessLoaded = useAppSelector(state => state.youtube.isAccessLoaded)

  const searchInput = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(filterStr)

  useEffect(() => {
    if (userId && !ytAccessLoaded) dispatch(fetchYoutubeAccess())
  }, [dispatch, userId, ytAccessLoaded])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value)
    dispatch(setFilterStr(event.target.value))
    if (ytMode) dispatch(setYoutubeMode(false))
  }

  const clearSearch = () => {
    setValue('')
    dispatch(resetFilterStr())
    if (ytMode) dispatch(setYoutubeMode(false))
  }

  const handleMagnifierClick = () => {
    if (value.trim()) clearSearch()
    else searchInput.current?.focus()
  }

  const handleYoutubeClick = () => {
    if (!ytAccessLoaded) dispatch(fetchYoutubeAccess())
    const q = value.trim()
    if (!q) {
      searchInput.current?.focus()
      return
    }
    dispatch(setYoutubeMode(true))
    dispatch(youtubeSearch(q))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = value.trim()
    if (!q || !showYoutubeBtn) return
    dispatch(setYoutubeMode(true))
    dispatch(youtubeSearch(q))
    searchInput.current?.blur()
  }

  const showYoutubeBtn = !!(ytAccess?.isEnabled && ytAccess.hasAccess)

  return (
    <div className={styles.container}>
      <Button
        className={clsx(styles.btnMagnifier, filterStr && styles.active)}
        icon='MAGNIFIER'
        onClick={handleMagnifierClick}
      />
      <input
        type='search'
        className={styles.searchInput}
        placeholder='search'
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={searchInput}
      />
      {filterStr && (
        <Button
          icon='CLEAR'
          onClick={clearSearch}
          className={clsx(styles.btnClear, styles.active)}
        />
      )}
      {showYoutubeBtn && (
        <Button
          className={clsx(styles.btnYoutube, ytMode && styles.active)}
          icon='YOUTUBE'
          onClick={handleYoutubeClick}
          title='Search YouTube'
        />
      )}
      <Button
        className={clsx(styles.btnStar, filterStarred && styles.active)}
        icon='STAR_FULL'
        onClick={() => dispatch(toggleFilterStarred())}
      />
    </div>
  )
}

export default LibraryHeader
