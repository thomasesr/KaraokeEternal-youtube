import React, { useEffect, useState, useRef } from 'react'
import clsx from 'clsx'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { setFilterStr, resetFilterStr, toggleFilterStarred } from '../../modules/library'
import { setYoutubeMode, youtubeSearch, fetchYoutubeConfig } from 'store/modules/youtube'
import Button from 'components/Button/Button'
import styles from './LibraryHeader.css'

const LibraryHeader = () => {
  const dispatch = useAppDispatch()
  const { filterStr, filterStarred } = useAppSelector(state => state.library)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const ytMode = useAppSelector(state => state.youtube.isModeActive)
  const ytConfig = useAppSelector(state => state.youtube.config)
  const ytConfigLoaded = useAppSelector(state => state.youtube.isConfigLoaded)

  const searchInput = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(filterStr)

  useEffect(() => {
    if (isAdmin && !ytConfigLoaded) dispatch(fetchYoutubeConfig())
  }, [dispatch, isAdmin, ytConfigLoaded])

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
    if (!ytConfigLoaded) dispatch(fetchYoutubeConfig())
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

  const showYoutubeBtn = isAdmin && ytConfig?.isEnabled

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
