import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './EmptyState.scss'

export default function EmptyState({ text = '暂无数据', tip, image, showActions = false }) {
  return (
    <View className='empty-state'>
      <Image 
        src={image || 'https://img.icons8.com/ios/452/nothing-found.png'} 
        className='empty-image' 
        mode='aspectFit' 
      />
      <Text className='empty-text'>{text}</Text>
      {tip && <Text className='empty-tip'>{tip}</Text>}
      {showActions && (
        <View className='empty-actions'>
          <View className='btn primary' onClick={() => Taro.reLaunch({ url: '/pages/op1/op1' })}>
            <Text className='btn-text'>去首页</Text>
          </View>
          <View className='btn secondary' onClick={() => Taro.reLaunch({ url: '/pages/op14/op14' })}>
            <Text className='btn-text'>去列表</Text>
          </View>
        </View>
      )}
    </View>
  )
}
