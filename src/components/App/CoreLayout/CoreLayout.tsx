import React, { useEffect, useRef } from 'react'
import { useMatch } from 'react-router'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import useResizeObserver from 'use-resize-observer'
// global stylesheets should be imported before any
// components that will import their own modular css
import '../../../styles/global.css'
import Button from 'components/Button/Button'
import Header from 'components/Header/Header'
import Navigation from 'components/Navigation/Navigation'
import Modal from 'components/Modal/Modal'
import SongInfo from 'components/SongInfo/SongInfo'
import ScoringPopup from 'components/ScoringPopup/ScoringPopup'
import Routes from '../Routes/Routes'
import { clearErrorMessage, setFooterHeight, setHeaderHeight } from 'store/modules/ui'
import { subscribePush } from 'store/modules/push'
import usePwaRoom from 'hooks/usePwaRoom'

const CoreLayout = () => {
  usePwaRoom()
  const isPlayerRoute = useMatch('/player')
  const dispatch = useAppDispatch()
  const headerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)

  useResizeObserver({
    onResize: ({ height }) => { dispatch(setHeaderHeight(height)) },
    ref: headerRef,
  })

  useResizeObserver({
    onResize: ({ height }) => { dispatch(setFooterHeight(height)) },
    ref: navRef,
  })

  const ui = useAppSelector(state => state.ui)
  const theme = useAppSelector(state => state.prefs.theme)
  const userId = useAppSelector(state => state.user.userId)
  const closeError = () => dispatch(clearErrorMessage())

  // Auto-subscribe to push when the user logs in or loads the page while logged in.
  // Chrome/Firefox will show the permission dialog here; Safari requires a user
  // gesture so the NotifPrefs checkbox remains the Safari path.
  useEffect(() => {
    if (userId) {
      dispatch(subscribePush())
    }
  }, [dispatch, userId])

  useEffect(() => {
    if (theme && theme !== 'blue') {
      document.documentElement.setAttribute('data-theme', theme)
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }, [theme])

  return (
    <>
      <Header ref={headerRef} />

      <Routes />

      {!isPlayerRoute && <Navigation ref={navRef} />}

      <SongInfo />

      <ScoringPopup />

      {ui.isErrored && (
        <Modal
          title='Oops...'
          onClose={closeError}
          buttons={<Button variant='primary' onClick={closeError}>OK</Button>}
        >
          <p style={{ WebkitUserSelect: 'text', userSelect: 'text' }}>
            {ui.errorMessage}
          </p>
        </Modal>
      )}
    </>
  )
}

export default CoreLayout
