import { View, ScrollView } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import BottomNav from '../../components/BottomNav/BottomNav'
import HotelCard from '../../components/HotelCard/HotelCard'
import EmptyState from '../../components/EmptyState/EmptyState'
import { getFavorites } from '../../un/api'
import './op15.scss'

export default function Op15() {
  const router = useRouter()
  const currentPath = `/${router?.path}`
  const [favorites, setFavorites] = useState([])

  useDidShow(() => {
    loadFavorites()
  })

  const loadFavorites = () => {
    const favs = getFavorites()
    setFavorites(favs)
  }

  const handleCardClick = (hotel) => {
    Taro.navigateTo({
      url: `/pages/op11/op11?id=${hotel.id}`
    })
  }

  return (
    <View className='op15'>
      <ScrollView
        scrollY
        className='favorites-scroll'
        enhanced
        showScrollbar={false}
      >
        {favorites.length === 0 ? (
          <EmptyState
            text='暂无收藏'
            tip='去首页逛逛，收藏喜欢的酒店吧'
            showActions={true}
          />
        ) : (
          favorites.map(hotel => (
            <HotelCard
              key={hotel.id}
              hotel={hotel}
              onClick={handleCardClick}
            />
          ))
        )}
      </ScrollView>

      <BottomNav currentPath={currentPath} />
    </View>
  )
}