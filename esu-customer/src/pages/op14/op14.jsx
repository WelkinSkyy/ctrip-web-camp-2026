import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { fetchHotelList } from '../../un/api'
import HotelCard from '../../components/HotelCard/HotelCard.jsx'
import HotelSkeleton from '../../components/Skeleton/HotelSkeleton'
import EmptyState from '../../components/EmptyState/EmptyState'
import BottomNav from '../../components/BottomNav/BottomNav'
import './op14.scss'
import FilterModal from '../../components/FilterModal/FilterModal'
import SortModal from '../../components/SortModal/SortModal'
import PriceStarModal from '../../components/PriceStarModal/PriceStarModal'
import DistanceModal from '../../components/DistanceModal/DistanceModal'
import CalendarModal from '../op1/CalendarModal/CalendarModal'
import GuestModal from '../../components/GuestModal/GuestModal'

export default function Op14() {
  const router = useRouter()
  const currentPath = `/${router?.path}`

  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({})
  const [sortType, setSortType] = useState('smart')
  const [showFilterModal, setShowFilterModal] = useState(false)
  const [showSortModal, setShowSortModal] = useState(false)
  const [showPriceStarModal, setShowPriceStarModal] = useState(false)
  const [showDistanceModal, setShowDistanceModal] = useState(false)
  const [showDateModal, setShowDateModal] = useState(false)
  const [showGuestModal, setShowGuestModal] = useState(false)

  useEffect(() => {
    const { city, checkIn, checkOut, rooms, adults, childs, price, star, keyword, tag } = router.params
    setFilters({ 
      city: city ? decodeURIComponent(city) : undefined,
      checkIn, checkOut, rooms, adults, childs, price, star, keyword, tag 
    })
    setPage(1)
    setHotels([])
    setHasMore(true)
  }, [router.params])

  useEffect(() => {
    const listener = (city) => {
      console.log('【事件】收到城市：', city);
      setFilters(prev => ({ ...prev, city: decodeURIComponent(city) }));;
      setHasMore(true);
      setPage(1);
    };
    Taro.eventCenter.on('citySelected', listener);
    return () => Taro.eventCenter.off('citySelected', listener);
  }, []);

  useEffect(() => {
    const listener = (keyword) => {
      setFilters(prev => ({ ...prev, keyword }));
      setHasMore(true);
      setPage(1);
    };
    Taro.eventCenter.on('searchKeywordSelected', listener);
    return () => Taro.eventCenter.off('searchKeywordSelected', listener);
  }, []);

  const loadHotels = async (pageNum = 1) => {
    if (loading || !hasMore) return
    setLoading(true)
    const params = {
      ...filters,
      city: filters.city ? decodeURIComponent(filters.city) : undefined,
      page: pageNum,
      pageSize: 10,
      sort: sortType,
    }
    console.log('请求参数:', params)
    const data = await fetchHotelList(params)
    if (data.length < 10) setHasMore(false)
    if (pageNum === 1) {
      setHotels(data)
    } else {
      setHotels(prev => [...prev, ...data])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadHotels(1)
  }, [filters, sortType])

  const onScrollToLower = () => {
    if (hasMore && !loading) {
      const nextPage = page + 1
      setPage(nextPage)
      loadHotels(nextPage)
    }
  }

  const handleCardClick = (hotel) => {
    Taro.navigateTo({
      url: `/pages/op11/op11?id=${hotel.id}&checkIn=${filters.checkIn || ''}&checkOut=${filters.checkOut || ''}&rooms=${filters.rooms || 1}&adults=${filters.adults || 1}&childs=${filters.childs || 0}`
    })
  }

  const handleFilterConfirm = (filterParams) => {
    const converted = {
      facilities: filterParams.facility,
      score: filterParams.score ? filterParams.score[0] : undefined,
      reviewCount: filterParams.reviewCount ? filterParams.reviewCount[0] : undefined,
    }
    setFilters(prev => ({ ...prev, ...converted }))
  }

  const handleSortSelect = (sortKey) => {
    setSortType(sortKey)
  }

  const handlePriceStarConfirm = (params) => {
    setFilters(prev => ({
      ...prev,
      priceMin: params.price[0],
      priceMax: params.price[1],
      stars: params.stars,
    }))
  }

  const handleDistanceConfirm = (distance) => {
    setFilters(prev => ({
      ...prev,
      maxDistance: distance,
    }))
  }

  const handleDateConfirm = (newCheckIn, newCheckOut) => {
    setFilters(prev => ({
      ...prev,
      checkIn: newCheckIn,
      checkOut: newCheckOut,
    }))
  }

  const handleGuestConfirm = (guestParams) => {
    setFilters(prev => ({
      ...prev,
      rooms: guestParams.rooms,
      adults: guestParams.adults,
      childs: guestParams.childs,
    }))
  }

  const goToSearch = () => {
    Taro.navigateTo({ url: '/pages/op12/op12' })
  }

  const goToCitySelect = () => {
    Taro.navigateTo({ url: '/pages/op13/op13' })
  }

  const quickTagList = [
    { label: '房间布局', field: 'layout', value: 'roomLayout' },
    { label: '4钻/星|高档', field: 'stars', value: ['4'] },
    { label: '双床房', field: 'tag', value: 'twin' },
    { label: '4.7分以上', field: 'score', value: 'ge47' },
    { label: '新开业', field: 'openingYear', value: '2025' },
  ]

  const handleQuickTagClick = (tag) => {
    let newFilter = {}
    if (tag.field === 'stars') {
      newFilter.stars = tag.value
    } else if (tag.field === 'tag') {
      newFilter.tag = tag.value
    } else if (tag.field === 'score') {
      newFilter.score = tag.value
    } else if (tag.field === 'keyword') {
      newFilter.keyword = tag.value
    } else {
      return
    }
    setFilters(prev => ({ ...prev, ...newFilter }))
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return dateStr.slice(5).replace('-', '/')
  }

  const calculateNights = () => {
    if (!filters.checkIn || !filters.checkOut) return 1
    const checkInDate = new Date(filters.checkIn)
    const checkOutDate = new Date(filters.checkOut)
    const diffTime = checkOutDate - checkInDate
    const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return nights > 0 ? nights : 1
  }

  return (
    <View className='op14'>
      {/* 顶部筛选头 */}
      <View className='filter-header'>
        <View className='location' onClick={goToCitySelect}>
          <Text className='city'>{filters.city || '全国'}</Text>
          <Text className='arrow'>▼</Text>
        </View>
        <View className='search-box' onClick={goToSearch}>
          <Text className='search-icon'>🔍</Text>
          <Text className='search-placeholder'>位置/品牌/酒店</Text>
        </View>
      </View>

      {/* 日期和人数 */}
      <View className='date-guests'>
        <View className='date-left'>
          <Text className='date' onClick={() => setShowDateModal(true)}>
            {formatDate(filters.checkIn) || '02/22'} - {formatDate(filters.checkOut) || '02/23'}
          </Text>
          <Text className='night-badge'>共{calculateNights()}晚</Text>
        </View>
        <Text className='guests' onClick={() => setShowGuestModal(true)}>
          {filters.rooms || 1}间房 {filters.adults || 1}成人 {filters.childs || 0}儿童
        </Text>
      </View>

      {/* 筛选栏 */}
      <View className='filter-bar'>
        <View className='filter-item' onClick={() => setShowSortModal(true)}>
          <Text className={sortType !== 'smart' ? 'active' : ''}>智能排序</Text>
          <Text className='arrow'>▾</Text>
        </View>
        <View className='filter-item' onClick={() => setShowDistanceModal(true)}>
          <Text className={filters.maxDistance ? 'active' : ''}>位置距离</Text>
          <Text className='arrow'>▾</Text>
        </View>
        <View className='filter-item' onClick={() => setShowPriceStarModal(true)}>
          <Text>价格/星级</Text>
          <Text className='arrow'>▾</Text>
        </View>
        <View className='filter-item' onClick={() => setShowFilterModal(true)}>
          <Text>筛选</Text>
          <Text className='arrow'>▾</Text>
        </View>
      </View>

      {/* 快捷标签 */}
      <ScrollView scrollX className='quick-tags' showScrollbar={false}>
        {quickTagList.map(tag => (
          <Text
            key={tag.label}
            className='tag'
            onClick={() => handleQuickTagClick(tag)}
          >
            {tag.label}
          </Text>
        ))}
      </ScrollView>

      {/* 酒店列表 */}
      <ScrollView
        scrollY
        className='hotel-scroll'
        onScrollToLower={onScrollToLower}
        lowerThreshold={50}
      >
        {loading && page === 1 ? (
          <HotelSkeleton count={4} />
        ) : (
          <>
            {hotels.map(hotel => (
              <HotelCard key={hotel.id} hotel={hotel} onClick={handleCardClick} />
            ))}
            
            {loading && page > 1 && (
              <View className='loading-more'>加载中...</View>
            )}
            
            {!hasMore && hotels.length > 0 && (
              <View className='no-more'>没有更多了</View>
            )}
            
            {!loading && hotels.length === 0 && (
              <EmptyState text='暂无相关酒店' />
            )}
          </>
        )}
      </ScrollView>

      {/* 弹窗组件 */}
      <SortModal
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        onSelect={handleSortSelect}
        currentSort={sortType}
      />

      <PriceStarModal
        visible={showPriceStarModal}
        onClose={() => setShowPriceStarModal(false)}
        onConfirm={handlePriceStarConfirm}
        initialPrice={[filters.priceMin || 0, filters.priceMax || 1300]}
        initialStars={filters.stars || []}
      />

      <DistanceModal
        visible={showDistanceModal}
        onClose={() => setShowDistanceModal(false)}
        onConfirm={handleDistanceConfirm}
        currentDistance={filters.maxDistance}
      />

      <FilterModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onConfirm={handleFilterConfirm}
        initialFilters={filters}
      />

      <CalendarModal
        visible={showDateModal}
        onClose={() => setShowDateModal(false)}
        onConfirm={handleDateConfirm}
        checkIn={filters.checkIn || ''}
        checkOut={filters.checkOut || ''}
      />

      <GuestModal
        visible={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        onConfirm={handleGuestConfirm}
        initialRooms={filters.rooms || 1}
        initialAdults={filters.adults || 1}
        initialChilds={filters.childs || 0}
      />

      <BottomNav currentPath={currentPath} />
    </View>
  )
}
