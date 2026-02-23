import { View, Text, Button } from '@tarojs/components'
import { useState } from 'react'
import './GuestModal.scss'

export default function GuestModal({ visible, onClose, onConfirm, initialRooms = 1, initialAdults = 1, initialChilds = 0 }) {
  const [roomCount, setRoomCount] = useState(initialRooms)
  const [adultCount, setAdultCount] = useState(initialAdults)
  const [childCount, setChildCount] = useState(initialChilds)

  const handleConfirm = () => {
    onConfirm({ rooms: roomCount, adults: adultCount, childs: childCount })
    onClose()
  }

  if (!visible) return null

  return (
    <View
      className={`guest-modal-mask ${visible ? 'active' : ''}`}
      onClick={onClose}
    >
      <View className='guest-modal-content' onClick={e => e.stopPropagation()}>
        <View className='modal-header'>
          <Text className='cancel' onClick={onClose}>取消</Text>
          <Text className='title'>选择客房和入住人数</Text>
          <Text className='confirm' onClick={handleConfirm}>完成</Text>
        </View>
        <View className='guest-body'>
          <View className='guest-tip'>ℹ️ 入住人数较多时，试试增加间数</View>
          <View className='guest-item'>
            <Text className='guest-label'>间数</Text>
            <View className='stepper'>
              <Text className='stepper-btn' onClick={() => setRoomCount(Math.max(1, roomCount - 1))}>-</Text>
              <Text className='stepper-value'>{roomCount}</Text>
              <Text className='stepper-btn' onClick={() => setRoomCount(roomCount + 1)}>+</Text>
            </View>
          </View>
          <View className='guest-item'>
            <Text className='guest-label'>成人数</Text>
            <View className='stepper'>
              <Text className='stepper-btn' onClick={() => setAdultCount(Math.max(1, adultCount - 1))}>-</Text>
              <Text className='stepper-value'>{adultCount}</Text>
              <Text className='stepper-btn' onClick={() => setAdultCount(adultCount + 1)}>+</Text>
            </View>
          </View>
          <View className='guest-item'>
            <View className='guest-label-wrap'>
              <Text className='guest-label'>儿童数</Text>
              <Text className='guest-sub'>0-17岁</Text>
            </View>
            <View className='stepper'>
              <Text className='stepper-btn' onClick={() => setChildCount(Math.max(0, childCount - 1))}>-</Text>
              <Text className='stepper-value'>{childCount}</Text>
              <Text className='stepper-btn' onClick={() => setChildCount(childCount + 1)}>+</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}