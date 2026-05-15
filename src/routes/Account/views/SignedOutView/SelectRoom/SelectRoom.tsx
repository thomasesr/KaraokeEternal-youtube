import React from 'react'
import clsx from 'clsx'
import styles from './SelectRoom.css'
import type { Room } from 'shared/types'

interface SelectRoomProps {
  className?: string
  rooms: {
    result: number[]
    entities: Record<number, Room>
  }
  roomId: number | null
  roomPassword: string
  showAllRooms: boolean
  onRoomSelect: (value: number) => void
  onRoomPasswordChange: (value: string) => void
}

const SelectRoom = ({
  onRoomSelect,
  onRoomPasswordChange,
  className,
  rooms,
  roomId,
  roomPassword,
  showAllRooms,
}: SelectRoomProps) => {
  const visibleRooms = showAllRooms
    ? rooms.result
    : rooms.result.filter(id => id === roomId)

  const selectedRoom = roomId !== null ? rooms.entities[roomId] : null
  const showPassword = selectedRoom?.hasPassword ?? false

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onRoomSelect(parseInt(e.target.value))
  }

  return (
    <div className={clsx(styles.container, className)}>
      <select
        className={styles.select}
        value={roomId ?? ''}
        onChange={handleChange}
        aria-label='Select room'
        size={Math.max(2, visibleRooms.length)}
      >
        {visibleRooms.map(id => (
          <option key={id} value={id}>
            {rooms.entities[id].name}
          </option>
        ))}
      </select>

      {showPassword && (
        <input
          type='password'
          autoComplete='off'
          onChange={(e) => { onRoomPasswordChange(e.target.value) }}
          placeholder='room password (required)'
          aria-label='room password (required)'
          value={roomPassword}
        />
      )}
    </div>
  )
}

export default SelectRoom
