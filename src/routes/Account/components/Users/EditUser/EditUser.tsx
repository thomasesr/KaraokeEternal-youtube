import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch } from 'store/hooks'
import { createUser, removeUser, updateUser } from '../../../modules/users'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import AccountForm from '../../AccountForm/AccountForm'
import { UserWithRole } from 'shared/types'
import styles from './EditUser.css'

interface EditUserProps {
  user?: UserWithRole
  onClose: () => void
}

const EditUser = ({ user, onClose }: EditUserProps) => {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()

  const handleSubmit = (data: FormData) => {
    if (user) dispatch(updateUser({ userId: user.userId, data }))
    else dispatch(createUser(data))
  }

  const handleRemoveClick = () => {
    if (user && confirm(t('users.removeUserConfirm', { name: user.username }))) {
      dispatch(removeUser(user.userId))
    }
  }

  return (
    <Modal
      className={styles.modal}
      onClose={onClose}
      title={user ? user.username : t('users.createUser')}
    >
      <AccountForm user={user} onSubmit={handleSubmit} showRole autoFocus={!user}>
        <div className={styles.btnContainer}>
          {!user && (
            <Button type='submit' className={styles.btn} variant='primary'>
              {t('users.createUser')}
            </Button>
          )}

          {user && (
            <Button type='submit' className={styles.btn} variant='primary'>
              {t('users.updateUser')}
            </Button>
          )}

          {user && (
            <Button onClick={handleRemoveClick} className={styles.btn} variant='danger'>
              {t('users.removeUser')}
            </Button>
          )}

          <Button onClick={onClose} variant='default'>
            {t('common.cancel')}
          </Button>
        </div>
      </AccountForm>
    </Modal>
  )
}

export default EditUser
