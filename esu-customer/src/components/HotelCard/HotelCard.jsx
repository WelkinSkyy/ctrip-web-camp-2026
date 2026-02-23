import { View, Text, Image } from '@tarojs/components'
import './HotelCard.scss'

const HotelCard = ({ hotel, onClick }) => {
  const handleClick = () => {
    if (onClick) onClick(hotel)
  }

  const formatDistance = (distance) => {
    if (distance < 1000) return `距您${distance}米`
    return `距您${(distance / 1000).toFixed(1)}公里`
  }

  const formatReviewCount = (count) => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万+条`
    return `${count}条`
  }

  return (
    <View className='hotel-card' onClick={handleClick}>
      <View className='hotel-image'>
        <Image src={hotel.img} mode='aspectFill' lazyLoad className='hotel-img' />
      </View>
      <View className='hotel-info'>
        <View className='hotel-header'>
          <Text className='hotel-name'>{hotel.name}</Text>
          {hotel.tags && hotel.tags.length > 0 && (
            <View className='hotel-tags'>
              {hotel.tags.slice(0, 2).map((tag, idx) => (
                <Text key={idx} className='tag'>{tag}</Text>
              ))}
            </View>
          )}
        </View>

        <View className='hotel-meta'>
          <View className='score'>
            <Text className='score-num'>{hotel.score}</Text>
          </View>
          <Text className='review-count'>{formatReviewCount(hotel.reviewCount)}点评</Text>
        </View>

        <Text className='hotel-location'>{formatDistance(hotel.distance)} · {hotel.address}</Text>

        {hotel.promotions && hotel.promotions.length > 0 && (
          <View className='hotel-promotions'>
            {hotel.promotions.slice(0, 2).map((promo, idx) => (
              <Text key={idx} className='promo'>{promo}</Text>
            ))}
          </View>
        )}

        <View className='hotel-price'>
          <Text className='current-price'>
            <Text className='currency'>¥</Text>{hotel.price}起
          </Text>
          {hotel.originalPrice && (
            <Text className='original-price'>¥{hotel.originalPrice}</Text>
          )}
        </View>
      </View>
    </View>
  )
}

export default HotelCard
