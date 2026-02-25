import Taro from '@tarojs/taro'

const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://trip.w-sky.cc:8433'
  : 'http://8.145.34.161:3002'

const getAuthToken = () => {
  try {
    return Taro.getStorageSync('token') || ''
  } catch (err) {
    return ''
  }
}

const request = async (url, options = {}) => {
  const token = getAuthToken()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await Taro.request({
      url: `${BASE_URL}${url}`,
      ...options,
      header: headers,
    })
    
    if (response.statusCode >= 400) {
      const errorMsg = response.data?.message || '请求失败'
      if (response.statusCode === 401) {
        Taro.removeStorageSync('token')
        Taro.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
        setTimeout(() => Taro.navigateTo({ url: '/pages/login/login' }), 1500)
        throw new Error('Unauthorized')
      }
      Taro.showToast({ title: errorMsg, icon: 'none' })
      throw new Error(errorMsg)
    }
    
    return response.data
  } catch (error) {
    console.error('API request failed:', error)
    throw error
  }
}

export const login = async (username, password) => {
  return request('/users/login', {
    method: 'POST',
    data: { username, password }
  })
}

export const register = async (username, password, role = 'customer', phone = null, email = null) => {
  return request('/users/register', {
    method: 'POST',
    data: { username, password, role, phone, email }
  })
}

export const fetchBanners = async () => {
  try {
    const data = await request('/carousel')
    return data.map(item => ({
      id: item.hotelId,
      img: item.image,
      title: ''
    }))
  } catch (error) {
    console.error('Failed to fetch banners:', error)
    return []
  }
}

export const fetchTabContents = async (tabKey) => {
  return []
}

export const fetchQuickTags = async () => {
  return []
}

export const fetchHotelList = async (params = {}) => {
  try {
    const {
      city, tag, keyword, sort,
      priceMin, priceMax,
      maxDistance,
      stars,
      facilities,
      score,
      reviewCount,
      page = 1,
      pageSize = 10,
      checkIn,
      checkOut,
      userLat,
      userLng,
    } = params

    const queryParams = new URLSearchParams()
    
    if (keyword || city) {
      queryParams.append('keyword', keyword || city || '')
    }
    if (tag) {
      queryParams.append('keyword', tag)
    }
    if (checkIn) {
      queryParams.append('checkIn', checkIn)
    }
    if (checkOut) {
      queryParams.append('checkOut', checkOut)
    }
    if (stars && stars.length > 0) {
      queryParams.append('starRating', String(stars[0]))
    }
    if (facilities && facilities.length > 0) {
      facilities.forEach(f => queryParams.append('facilities', f))
    }
    if (priceMin !== undefined) {
      queryParams.append('priceMin', String(priceMin))
    }
    if (priceMax !== undefined) {
      queryParams.append('priceMax', String(priceMax))
    }
    
    if (userLat !== undefined && userLng !== undefined) {
      queryParams.append('userLat', String(userLat))
      queryParams.append('userLng', String(userLng))
      if (maxDistance) {
        queryParams.append('radius', String(maxDistance / 1000))
      }
    }
    
    const sortByMap = {
      'smart': undefined,
      'distance_asc': 'distance',
      'price_asc': 'price',
      'price_desc': undefined,
      'score_desc': 'rating',
      'stars_desc': undefined,
    }
    
    if (sortByMap[sort]) {
      queryParams.append('sortBy', sortByMap[sort])
    }
    
    queryParams.append('page', String(page))
    queryParams.append('limit', String(pageSize))

    const data = await request(`/hotels?${queryParams.toString()}`)
    
    const hotels = data.hotels.map(hotel => {
      const minPrice = Math.min(...(hotel.roomTypes?.map(rt => rt.discountedPrice || rt.price) || [0]))
      return {
        id: hotel.id,
        name: hotel.nameZh,
        price: minPrice,
        originalPrice: minPrice,
        address: hotel.address,
        distance: hotel.distance,
        stars: hotel.starRating,
        score: hotel.averageRating,
        reviewCount: hotel.ratingCount,
        tags: hotel.tags || [],
        promotions: (hotel.promotions || []).map(p => p.description || p.type || '优惠'),
        img: hotel.images?.[0] || 'https://picsum.photos/200/120',
      }
    })
    
    return { hotels, total: data.total }
  } catch (error) {
    console.error('Failed to fetch hotel list:', error)
    return { hotels: [], total: 0 }
  }
}

export const fetchHotelDetail = async (id) => {
  try {
    const hotel = await request(`/hotels/${id}`)
    if (!hotel) return null
    
    return {
      id: hotel.id,
      name: hotel.nameZh,
      address: hotel.address,
      stars: hotel.starRating,
      score: hotel.averageRating,
      reviewCount: hotel.ratingCount,
      tags: hotel.tags || [],
      images: hotel.images || [],
      facilities: hotel.facilities || [],
      nearbyAttractions: hotel.nearbyAttractions || [],
      promotions: (hotel.promotions || []).map(p => p.description || p.type || '优惠'),
      rooms: hotel.roomTypes?.map(rt => ({
        id: rt.id,
        name: rt.name,
        price: rt.discountedPrice || rt.price,
        originalPrice: rt.price,
        bed: rt.capacity ? rt.capacity + '人' : '未知',
        area: '未知',
        floor: '未知',
        capacity: rt.capacity || 2,
        breakfast: false,
        cancel: '不可取消',
        img: hotel.images?.[0] || 'https://picsum.photos/200/150',
      })) || [],
    }
  } catch (error) {
    console.error('Failed to fetch hotel detail:', error)
    return null
  }
}

export const fetchOrders = async (params = {}) => {
  try {
    const { status, page = 1, pageSize = 10 } = params
    
    const queryParams = new URLSearchParams()
    queryParams.append('page', String(page))
    queryParams.append('limit', String(pageSize))
    if (status) {
      queryParams.append('status', status)
    }
    
    const data = await request(`/bookings?${queryParams.toString()}`)
    
    const bookings = data.bookings.map(booking => ({
      id: booking.id,
      hotelName: booking.hotel?.nameZh,
      hotelImage: booking.hotel?.images?.[0] || '',
      roomTypeName: booking.roomType?.name,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: Math.ceil((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000*60*60*24)),
      totalPrice: booking.totalPrice,
      status: booking.status,
    }))
    
    return { bookings, total: data.total }
  } catch (error) {
    console.error('Failed to fetch orders:', error)
    return { bookings: [], total: 0 }
  }
}

export const createOrder = async (orderData) => {
  try {
    const { hotelId, roomTypeId, checkIn, checkOut, promotionId } = orderData
    
    const data = { hotelId, roomTypeId, checkIn, checkOut }
    if (promotionId) {
      data.promotionId = promotionId
    }
    
    const newOrder = await request('/bookings', {
      method: 'POST',
      data,
    })
    
    return newOrder
  } catch (error) {
    console.error('Failed to create order:', error)
    throw error
  }
}

export const cancelOrder = async (orderId) => {
  try {
    await request(`/bookings/${orderId}/cancel`, {
      method: 'PUT',
    })
    return { success: true }
  } catch (error) {
    console.error('Failed to cancel order:', error)
    return { success: false }
  }
}

const FAVORITES_KEY = 'favorites'

export const getFavorites = () => {
  try {
    const favs = Taro.getStorageSync(FAVORITES_KEY)
    return favs || []
  } catch (err) {
    return []
  }
}

export const addFavorite = (hotel) => {
  const favs = getFavorites()
  if (!favs.some(item => item.id === hotel.id)) {
    favs.push(hotel)
    Taro.setStorageSync(FAVORITES_KEY, favs)
  }
  return favs
}

export const removeFavorite = (hotelId) => {
  let favs = getFavorites()
  favs = favs.filter(item => item.id !== hotelId)
  Taro.setStorageSync(FAVORITES_KEY, favs)
  return favs
}

export const isFavorite = (hotelId) => {
  const favs = getFavorites()
  return favs.some(item => item.id === hotelId)
}
