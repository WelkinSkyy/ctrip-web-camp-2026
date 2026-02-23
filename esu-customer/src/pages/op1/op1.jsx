import { View, Swiper, SwiperItem, Image, Text, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState, useEffect, useMemo, useCallback } from 'react'
import './op1.scss'
import CalendarModal from './CalendarModal/CalendarModal'
import GuestModal from '../../components/GuestModal/GuestModal'
import PriceStarModal from '../../components/PriceStarModal/PriceStarModal'
import BottomNav from '../../components/BottomNav/BottomNav'
import { fetchBanners, fetchTabContents, fetchQuickTags } from '../../un/api'

const tabs = [
  { key: 'domestic', name: '国内' },
  { key: 'overseas', name: '海外' },
  { key: 'hourly', name: '钟点房' },
  { key: 'homestay', name: '民宿' },
]

export default function Index() {
  const router = useRouter()
  const currentPath = `/${router?.path}`

  const [bannerList, setBannerList] = useState([])
  const [activeTab, setActiveTab] = useState('domestic')
  const [tabContent, setTabContent] = useState([])
  const [quickTags, setQuickTags] = useState([])
  const [city, setCity] = useState('双峰')
  const [keyword, setKeyword] = useState('')

  // 日期工具函数
  const getDateStr = (offset = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const [checkIn, setCheckIn] = useState(getDateStr(0))
  const [checkOut, setCheckOut] = useState(getDateStr(1))

  const nights = useMemo(() => {
    const start = new Date(checkIn)
    const end = new Date(checkOut)
    const diff = (end - start) / (1000 * 60 * 60 * 24)
    return diff > 0 ? diff : 0
  }, [checkIn, checkOut])

  const formatDateDisplay = useCallback((dateStr) => {
    const date = new Date(dateStr)
    const month = date.getMonth() + 1
    const day = date.getDate()
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const weekday = weekdays[date.getDay()]

    const todayStr = getDateStr(0)
    const tomorrowStr = getDateStr(1)

    if (dateStr === todayStr) return { date: `${month}月${day}日`, label: '今天' }
    if (dateStr === tomorrowStr) return { date: `${month}月${day}日`, label: '明天' }
    return { date: `${month}月${day}日`, label: weekday }
  }, [])

  const [roomCount, setRoomCount] = useState(1)
  const [adultCount, setAdultCount] = useState(1)
  const [childCount, setChildCount] = useState(0)

  const [priceRange, setPriceRange] = useState('')
  const [starLevel, setStarLevel] = useState('')
  const [showPriceStarModal, setShowPriceStarModal] = useState(false)

  // 辅助函数：将显示字符串解析回数组，用于弹窗初始值
  const parsePriceRange = (rangeStr) => {
    if (!rangeStr) return [0, 1300]
    const match = rangeStr.match(/¥(\d+)-(\d+)/)
    return match ? [parseInt(match[1]), parseInt(match[2])] : [0, 1300]
  }
  const parseStarLevel = (starStr) => {
    if (!starStr) return []
    return starStr.replace('星', '').split('、')
  }

  const [showDateModal, setShowDateModal] = useState(false)
  const [showGuestModal, setShowGuestModal] = useState(false)

  // 获取数据
  useEffect(() => {
    fetchBanners().then(setBannerList)
    fetchQuickTags().then(setQuickTags)
  }, [])
// 监听搜索关键词事件
useEffect(() => {
  const listener = (keyword) => {
    setKeyword(keyword)
  }
  Taro.eventCenter.on('searchKeywordSelected', listener)
  return () => {
    Taro.eventCenter.off('searchKeywordSelected', listener)
  }
}, [])
////////
  useEffect(() => {
    if (activeTab) {
      fetchTabContents(activeTab).then(setTabContent)
    }
  }, [activeTab])

  // ---------- 监听城市选择事件 ----------
  useEffect(() => {
    const listener = (selectedCity) => {
      setCity(selectedCity)
    }
    Taro.eventCenter.on('citySelected', listener)
    return () => {
      Taro.eventCenter.off('citySelected', listener)
    }
  }, [])

  const handleBannerClick = (item) => {
    Taro.navigateTo({ url: `/pages/op11/op11?id=${item.id}&title=${encodeURIComponent(item.title)}` })
  }
const handleTagClick = (tagName) => {
  Taro.navigateTo({
    url: `/pages/op14/op14?tag=${encodeURIComponent(tagName)}`
  })
}
  const handleSearchClick = () => {
    Taro.navigateTo({ url: '/pages/op12/op12' })
  }

  const handleCityClick = () => {
    Taro.navigateTo({ url: '/pages/op13/op13' })
  }

  const handleLocateClick = () => {
    Taro.navigateTo({ url: '/pages/op13/op13' })
  }

  const handleQuery = () => {
  Taro.navigateTo({
    url: `/pages/op14/op14?city=${city}&checkIn=${checkIn}&checkOut=${checkOut}&rooms=${roomCount}&adults=${adultCount}&childs=${childCount}&price=${priceRange}&star=${starLevel}&keyword=${encodeURIComponent(keyword)}`
  })
}
  const handleGuestConfirm = (params) => {
    setRoomCount(params.rooms)
    setAdultCount(params.adults)
    setChildCount(params.childs)
    setShowGuestModal(false)
  }

  const handlePriceStarConfirm = (params) => {
    const priceText = params.price[0] === 0 && params.price[1] === 1300 ? '' : `¥${params.price[0]}-${params.price[1]}`
    const starText = params.stars.length > 0 ? params.stars.join('、') + '星' : ''
    setPriceRange(priceText)
    setStarLevel(starText)
    setShowPriceStarModal(false)
  }

  return (
    <View className='index'>
      {/* 轮播图 */}
      {bannerList.length > 0 && (
        <Swiper
          className='banner'
          indicatorDots={true}
          indicatorColor='rgba(255,255,255,0.4)'
          indicatorActiveColor='#fff'
          circular
          autoplay
          interval={3000}
          duration={500}
        >
          {bannerList.map(item => (
            <SwiperItem key={item.id}>
              <View className='banner-item' onClick={() => handleBannerClick(item)}>
                <Image src={item.img} className='banner-img' mode='aspectFill' />
                <View className='banner-overlay'>
                  <View className='banner-title'>
                    <Text className='cn'>上享团圆</Text>
                    <Text className='en'>New Year</Text>
                  </View>
                  <View className='banner-tag'>酒店特惠 7折起</View>
                  <View className='banner-qualification'>资质说明</View>
                </View>
              </View>
            </SwiperItem>
          ))}
        </Swiper>
      )}

      {/* 预订卡片 */}
      <View className='booking-card'>
        {/* 顶部 Tab */}
        <View className='booking-tabs'>
          {tabs.map(tab => (
            <View
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Text className='tab-name'>{tab.name}</Text>
            </View>
          ))}
        </View>

        {/* 城市 + 搜索行 */}
        <View className='location-row'>
          <View className='city-selector' onClick={handleCityClick}>
            <Text className='city-name'>{city}</Text>
            <Text className='arrow'>▼</Text>
          </View>
          <View className='search-box' onClick={handleSearchClick}>
            <Text className='placeholder-text'>{keyword || '位置/品牌/酒店'}</Text>
            <View className='location-icon'></View>
          </View>
        </View>

        {/* 日期行 */}
        <View className='date-row' onClick={() => setShowDateModal(true)}>
          <View className='date-item'>
            <Text className='date-num'>{formatDateDisplay(checkIn).date}</Text>
            <Text className='date-label'>{formatDateDisplay(checkIn).label}</Text>
          </View>
          <Text className='date-separator'>-</Text>
          <View className='date-item'>
            <Text className='date-num'>{formatDateDisplay(checkOut).date}</Text>
            <Text className='date-label'>{formatDateDisplay(checkOut).label}</Text>
          </View>
          <Text className='night-count'>共{nights}晚</Text>
        </View>

        {/* 人数 + 价格星级 */}
        <View className='guest-row'>
          <View className='guest-selector' onClick={() => setShowGuestModal(true)}>
            <Text className='guest-text'>{roomCount}间房 {adultCount}成人 {childCount}儿童</Text>
            <Text className='arrow'>▼</Text>
          </View>
          <View className='guest-divider'></View>
          <View className='price-star' onClick={() => setShowPriceStarModal(true)}>
            <Text className='price-star-text'>{priceRange || starLevel ? (priceRange || '') + (starLevel ? '·' + starLevel : '') : '价格/星级'}</Text>
            <Text className='arrow'>▼</Text>
          </View>
        </View>

        {/* 查询按钮 */}
        <Button className='query-btn' onClick={handleQuery}>查询</Button>
      </View>

      <CalendarModal
        visible={showDateModal}
        onClose={() => setShowDateModal(false)}
        onConfirm={(newCheckIn, newCheckOut) => {
          setCheckIn(newCheckIn)
          setCheckOut(newCheckOut)
          setShowDateModal(false)
        }}
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

      <PriceStarModal
        visible={showPriceStarModal}
        onClose={() => setShowPriceStarModal(false)}
        onConfirm={handlePriceStarConfirm}
        initialPrice={parsePriceRange(priceRange)}
        initialStars={parseStarLevel(starLevel)}
      />

      <BottomNav currentPath={currentPath} />
    </View>
  )
}