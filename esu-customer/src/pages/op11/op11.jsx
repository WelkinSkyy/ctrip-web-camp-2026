import { View, Text, Image, Swiper, SwiperItem, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { fetchHotelDetail, isFavorite, addFavorite, removeFavorite } from '../../un/api'
import { FACILITY_ICONS } from '../../mock/facilities'
import { requireLogin, isLoggedIn } from '../../utils/auth'
import RoomCard from '../../components/RoomCard/RoomCard'
import CalendarModal from '../op1/CalendarModal/CalendarModal'
import GuestModal from '../../components/GuestModal/GuestModal'
import BookingModal from '../../components/BookingModal/BookingModal'
import './op11.scss'

const isH5 = process.env.TARO_ENV === 'h5'

const backIconBase64 = 'data:image/svg+xml,%3Csvg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M19 12H5M12 19l-7-7 7-7" stroke="%23333" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/%3E%3C/svg%3E'
const heartFilledBase64 = 'data:image/svg+xml,%3Csvg width="22" height="22" viewBox="0 0 24 24" fill="%23ff4757" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/%3E%3C/svg%3E'
const heartOutlineBase64 = 'data:image/svg+xml,%3Csvg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="%23333" stroke-width="2"/%3E%3C/svg%3E'
const shareIconBase64 = 'data:image/svg+xml,%3Csvg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/%3E%3C/svg%3E'

const BackIcon = () => {
  if (isH5) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M19 12H5M12 19l-7-7 7-7" stroke="#333" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return <Image src={backIconBase64} style={{ width: '48rpx', height: '48rpx' }} mode='aspectFit' />
}

const HeartIcon = ({ filled }) => {
  if (isH5) {
    if (filled) {
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#ff4757" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      )
    }
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke="#333" strokeWidth="2"/>
      </svg>
    )
  }
  return <Image src={filled ? heartFilledBase64 : heartOutlineBase64} style={{ width: '44rpx', height: '44rpx' }} mode='aspectFit' />
}

const ShareIcon = () => {
  if (isH5) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  return <Image src={shareIconBase64} style={{ width: '44rpx', height: '44rpx' }} mode='aspectFit' />
}

const FacilityIcon = ({ facility }) => {
  if (isH5) {
    return <View dangerouslySetInnerHTML={{ __html: facility.svgString }} style={{ width: '36rpx', height: '36rpx', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
  }
  return (
    <Image 
      src={facility.icon} 
      style={{ width: '36rpx', height: '36rpx' }}
      mode='aspectFit'
    />
  )
}

export default function Op11() {
  const router = useRouter()
  const { id, checkIn: initialCheckIn, checkOut: initialCheckOut, rooms: initialRooms, adults: initialAdults, childs: initialChilds } = router.params

  const [hotel, setHotel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFav, setIsFav] = useState(false)

  const getDefaultDate = (offset) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const [checkIn, setCheckIn] = useState(initialCheckIn || getDefaultDate(0))
  const [checkOut, setCheckOut] = useState(initialCheckOut || getDefaultDate(1))

  const [roomCount, setRoomCount] = useState(Number(initialRooms) || 1)
  const [adultCount, setAdultCount] = useState(Number(initialAdults) || 1)
  const [childCount, setChildCount] = useState(Number(initialChilds) || 0)

  const [showDateModal, setShowDateModal] = useState(false)
  const [showGuestModal, setShowGuestModal] = useState(false)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState(null)

  const nights = Math.ceil((new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24))

  useEffect(() => {
    const loadDetail = async () => {
      setLoading(true)
      const data = await fetchHotelDetail(id)
      setHotel(data)
      setLoading(false)
    }
    loadDetail()
  }, [id])

  useEffect(() => {
    if (hotel) {
      setIsFav(isFavorite(hotel.id))
    }
  }, [hotel])

  const handleFavorite = () => {
    const currentUrl = `/pages/op11/op11?id=${id}`
    if (!requireLogin(currentUrl)) {
      return
    }
    
    if (isFav) {
      removeFavorite(hotel.id)
      setIsFav(false)
      Taro.showToast({ title: '已取消收藏', icon: 'none' })
    } else {
      addFavorite(hotel)
      setIsFav(true)
      Taro.showToast({ title: '收藏成功', icon: 'success' })
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}月${day}日`
  }

  const formatDateWithWeekday = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const weekday = weekdays[date.getDay()]
    return `${month}月${day}日 ${weekday}`
  }

  const formatGuests = () => {
    return `${roomCount}间 ${adultCount}成人 ${childCount}儿童`
  }

  const handleDateConfirm = (newCheckIn, newCheckOut) => {
    setCheckIn(newCheckIn)
    setCheckOut(newCheckOut)
    setShowDateModal(false)
  }

  const handleGuestConfirm = (params) => {
    setRoomCount(params.rooms)
    setAdultCount(params.adults)
    setChildCount(params.childs)
    setShowGuestModal(false)
  }

  const handleOpenMap = () => {
    if (!hotel?.location) {
      Taro.showToast({ title: '暂无位置信息', icon: 'none' })
      return
    }

    const { latitude, longitude } = hotel.location

    Taro.openLocation({
      latitude,
      longitude,
      scale: 18,
      name: hotel.name,
      address: hotel.address,
      success: () => {
        console.log('打开地图成功')
      },
      fail: (err) => {
        console.error('打开地图失败', err)
        Taro.showToast({ title: '打开地图失败', icon: 'none' })
      }
    })
  }

  const handleRoomClick = (room) => {
    const currentUrl = `/pages/op11/op11?id=${id}`
    if (!requireLogin(currentUrl)) {
      return
    }
    setSelectedRoom(room)
    setShowBookingModal(true)
  }

  if (loading) {
    return (
      <View className='op11-loading'>
        <Text>加载中...</Text>
      </View>
    )
  }

  if (!hotel) {
    return (
      <View className='op11-error'>
        <Text>酒店不存在</Text>
      </View>
    )
  }

  const bannerImages = hotel.images && hotel.images.length > 0 ? hotel.images : [hotel.img]
  const sortedRooms = hotel.rooms ? [...hotel.rooms].sort((a, b) => a.price - b.price) : []
  const hotelFacilities = hotel.facilities ? hotel.facilities.map(id => FACILITY_ICONS[id]).filter(Boolean) : []

  return (
    <View className='op11'>
      <ScrollView scrollY className='content'>
        <Swiper
          className='banner'
          indicatorDots={bannerImages.length > 1}
          indicatorColor='rgba(255,255,255,0.4)'
          indicatorActiveColor='#ffffff'
          autoplay={bannerImages.length > 1}
          circular={bannerImages.length > 1}
          interval={3000}
          duration={500}
        >
          {bannerImages.map((img, index) => (
            <SwiperItem key={index}>
              <Image src={img} className='banner-img' mode='aspectFill' />
            </SwiperItem>
          ))}
        </Swiper>

        <View className='nav-header'>
          <View className='nav-back' onClick={() => Taro.navigateBack()}>
            <BackIcon />
          </View>
          <View className='nav-title'>
            <Text className='hotel-title-text'>{hotel.name}</Text>
          </View>
          <View className='header-actions'>
            <View
              className={`action-btn ${isFav ? 'favorited' : ''}`}
              onClick={handleFavorite}
            >
              <HeartIcon filled={isFav} />
            </View>
            <View className='action-btn' onClick={() => Taro.showToast({ title: '分享功能开发中', icon: 'none' })}>
              <ShareIcon />
            </View>
          </View>
        </View>

        <View className='hotel-info'>
          <View className='hotel-header'>
            <Text className='hotel-name'>{hotel.name}</Text>
            <View className='hotel-stars'>
              {Array.from({ length: 5 }).map((_, index) => (
                <Text key={index} className={`star ${index < hotel.stars ? 'active' : ''}`}>★</Text>
              ))}
            </View>
          </View>
          
          <View className='hotel-rating-row'>
            <View className='rating-badge'>
              <Text className='score'>{hotel.score}</Text>
              <Text className='rating-label'>超棒</Text>
            </View>
          </View>
          
          <View className='facility-tags-wrapper'>
            <ScrollView scrollX className='facility-tags' showScrollbar={false}>
              {hotelFacilities.map((facility, index) => (
                <View key={index} className='facility-tag'>
                  <FacilityIcon facility={facility} />
                  <Text className='tag-label'>{facility.name}</Text>
                </View>
              ))}
            </ScrollView>
            <View className='facility-tag more-btn'>
              <View className='more-text'>
                <View className='text-row'>
                  <Text>设</Text>
                  <Text>施</Text>
                </View>
                <View className='text-row'>
                  <Text>政</Text>
                  <Text>策</Text>
                </View>
              </View>
              <Text className='more-arrow'>{'>'}</Text>
            </View>
          </View>
        </View>

        <View className='date-guest-bar'>
          <View className='date-section' onClick={() => setShowDateModal(true)}>
            <View className='date-item'>
              <Text className='date-label'>今天</Text>
              <Text className='date-value'>{formatDate(checkIn)}</Text>
            </View>
            <View className='date-separator'>-</View>
            <View className='date-item'>
              <Text className='date-label'>明天</Text>
              <Text className='date-value'>{formatDate(checkOut)}</Text>
            </View>
            <View className='night-badge'>共{nights}晚</View>
          </View>
          <View className='guest-section' onClick={() => setShowGuestModal(true)}>
            <Text className='guest-text'>{formatGuests()}</Text>
            <Text className='guest-arrow'>▾</Text>
          </View>
        </View>

        <View className='room-type-tags'>
          <Text className='room-tag active'>含早餐</Text>
          <Text className='room-tag'>立即确认</Text>
          <Text className='room-tag'>大床房</Text>
          <Text className='room-tag'>双床房</Text>
          <Text className='room-tag'>免费取消</Text>
        </View>

        <View className='room-section'>
          {sortedRooms.length > 0 ? (
            sortedRooms.map(room => (
              <RoomCard key={room.id} room={room} onClick={handleRoomClick} />
            ))
          ) : (
            <Text className='no-rooms'>暂无房型信息</Text>
          )}
        </View>

      </ScrollView>

      <CalendarModal
        visible={showDateModal}
        onClose={() => setShowDateModal(false)}
        onConfirm={handleDateConfirm}
        checkIn={checkIn}
        checkOut={checkOut}
      />

      <GuestModal
        visible={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        onConfirm={handleGuestConfirm}
        initialRooms={roomCount}
        initialAdults={adultCount}
        initialChilds={childCount}
      />

      <BookingModal
        visible={showBookingModal}
        onClose={() => setShowBookingModal(false)}
        room={selectedRoom}
        hotelName={hotel?.name}
        hotelId={hotel?.id}
        hotelImage={hotel?.img || hotel?.images?.[0]}
        checkIn={checkIn}
        checkOut={checkOut}
        nights={nights}
        roomCount={roomCount}
        adultCount={adultCount}
        childCount={childCount}
      />
    </View>
  )
}
