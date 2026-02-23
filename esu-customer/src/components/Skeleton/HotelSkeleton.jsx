import { View } from '@tarojs/components'
import './HotelSkeleton.scss'

export default function HotelSkeleton({ count = 1 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} className='hotel-skeleton'>
          <View className='skeleton-img' />
          <View className='skeleton-info'>
            <View className='skeleton-line title' />
            <View className='skeleton-line meta' />
            <View className='skeleton-line tags' />
            <View className='skeleton-line price' />
          </View>
        </View>
      ))}
    </>
  )
}