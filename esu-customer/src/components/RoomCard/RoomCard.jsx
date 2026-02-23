import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './RoomCard.scss'

export default function RoomCard({ room, onClick }) {
  const handleClick = () => {
    if (onClick) onClick(room)
  }

  return (
    <View className='room-card' onClick={handleClick}>
      {/* 左侧房型图片 */}
      <View className='room-image'>
        <Image 
          src={room.img || 'https://picsum.photos/200/150?random=999'} 
          className='room-img' 
          mode='aspectFill'
        />
      </View>
      
      {/* 中间房型信息 */}
      <View className='room-content'>
        <Text className='room-name'>{room.name}</Text>
        <View className='room-desc'>
          <Text className='desc-item'>{room.bed}</Text>
          <Text className='desc-divider'>|</Text>
          <Text className='desc-item'>{room.area}</Text>
          <Text className='desc-divider'>|</Text>
          <Text className='desc-item'>{room.floor}</Text>
        </View>
        <View className='room-tags'>
          {room.breakfast && (
            <View className='tag tag-green'>
              <Text className='tag-text'>含早餐</Text>
            </View>
          )}
          {room.cancel === '免费取消' && (
            <View className='tag tag-blue'>
              <Text className='tag-text'>免费取消</Text>
            </View>
          )}
        </View>
      </View>
      
      {/* 右侧价格信息 */}
      <View className='room-price'>
        <View className='price-row'>
          <Text className='price-symbol'>¥</Text>
          <Text className='price-value'>{room.price}</Text>
          <Text className='price-unit'>起</Text>
        </View>
        {room.originalPrice && room.originalPrice > room.price && (
          <Text className='original-price'>¥{room.originalPrice}</Text>
        )}
        <View className='book-btn'>
          <Text className='book-text'>预订</Text>
        </View>
      </View>
    </View>
  )
}
