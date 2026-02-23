import { View, Text, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import { createOrder } from '../../un/api'
import './BookingModal.scss'

export default function BookingModal({ visible, onClose, room, hotelName, hotelId, hotelImage, checkIn, checkOut, nights, roomCount, adultCount, childCount }) {
  const [loading, setLoading] = useState(false)
  if (!visible) return null

  const handleBook = async () => {
    setLoading(true)
    try {
      const orderData = {
        hotelId: hotelId,
        hotelName: hotelName,
        hotelImage: hotelImage || 'https://picsum.photos/200/120',
        roomTypeId: room?.id,
        roomTypeName: room?.name,
        checkIn: checkIn,
        checkOut: checkOut,
        nights: nights || 1,
        totalPrice: (room?.price || 0) * (nights || 1),
      }
      await createOrder(orderData)
      Taro.showToast({ title: '预订成功', icon: 'success' })
      onClose()
      Taro.reLaunch({ url: '/pages/op16/op16' })
    } catch (err) {
      Taro.showToast({ title: '预订失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className={`booking-modal-mask ${visible ? 'active' : ''}`} onClick={onClose}>
      <View className='booking-modal-content' onClick={e => e.stopPropagation()}>
        <View className='modal-header'>
          <Text className='title'>房型详情</Text>
          <Text className='close' onClick={onClose}>×</Text>
        </View>

        <View className='modal-body'>
          <Text className='room-name'>{room?.name}</Text>
          <View className='detail-item'>
            <Text className='label'>床型</Text>
            <Text className='value'>{room?.bed || '未知'}</Text>
          </View>
          <View className='detail-item'>
            <Text className='label'>面积</Text>
            <Text className='value'>{room?.area || '未知'}</Text>
          </View>
          <View className='detail-item'>
            <Text className='label'>可住人数</Text>
            <Text className='value'>{room?.capacity || '2'}人</Text>
          </View>
          <View className='detail-item'>
            <Text className='label'>楼层</Text>
            <Text className='value'>{room?.floor || '未知'}</Text>
          </View>
          <View className='detail-item'>
            <Text className='label'>早餐</Text>
            <Text className='value'>{room?.breakfast ? '含早' : '不含早'}</Text>
          </View>
          <View className='detail-item'>
            <Text className='label'>取消政策</Text>
            <Text className='value'>{room?.cancel || '未知'}</Text>
          </View>
          <View className='detail-item'>
            <Text className='label'>入住日期</Text>
            <Text className='value'>{checkIn} 至 {checkOut} ({nights || 1}晚)</Text>
          </View>
          <View className='price-info'>
            <Text className='price'>¥{room?.price}</Text>
            <Text className='unit'>/晚</Text>
            {room?.originalPrice && (
              <Text className='original'>原价 ¥{room.originalPrice}</Text>
            )}
          </View>
        </View>

        <View className='modal-footer'>
          <Button className='book-btn' onClick={handleBook} disabled={loading}>
            {loading ? '预订中...' : '立即预订'}
          </Button>
        </View>
      </View>
    </View>
  )
}