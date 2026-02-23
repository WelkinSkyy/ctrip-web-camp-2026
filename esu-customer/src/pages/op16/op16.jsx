import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useRouter, usePullDownRefresh, useReachBottom } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import BottomNav from '../../components/BottomNav/BottomNav'
import { fetchOrders, cancelOrder } from '../../un/api'
import './op16.scss'

const statusMap = {
  pending: { text: '待确认', color: '#ff9800', bg: 'rgba(255,152,0,0.1)' },
  confirmed: { text: '已确认', color: '#4caf50', bg: 'rgba(76,175,80,0.1)' },
  completed: { text: '已完成', color: '#9e9e9e', bg: 'rgba(158,158,158,0.1)' },
  cancelled: { text: '已取消', color: '#f44336', bg: 'rgba(244,67,54,0.1)' }
}

const statusTabs = [
  { key: '', text: '全部' },
  { key: 'pending', text: '待确认' },
  { key: 'confirmed', text: '已确认' },
  { key: 'completed', text: '已完成' },
  { key: 'cancelled', text: '已取消' }
]

export default function Op16() {
  const router = useRouter()
  const currentPath = `/${router?.path}`

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [activeStatus, setActiveStatus] = useState('')

  const loadOrders = async (pageNum = 1, status = activeStatus, refresh = false) => {
    if (loading || (!hasMore && !refresh)) return
    setLoading(true)
    try {
      const res = await fetchOrders({ status: status || undefined, page: pageNum, pageSize: 10 })
      const { bookings, total } = res
      if (pageNum === 1) {
        setOrders(bookings)
      } else {
        setOrders(prev => [...prev, ...bookings])
      }
      setHasMore(bookings.length === 10 && orders.length + bookings.length < total)
      setPage(pageNum)
    } catch (err) {
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    setOrders([])
    setHasMore(true)
    loadOrders(1, activeStatus, true)
  }, [activeStatus])

  usePullDownRefresh(() => {
    loadOrders(1, activeStatus, true).then(() => {
      Taro.stopPullDownRefresh()
    })
  })

  useReachBottom(() => {
    if (hasMore && !loading) {
      loadOrders(page + 1, activeStatus)
    }
  })

  const handleCancel = async (orderId) => {
    Taro.showModal({
      title: '取消订单',
      content: '确定要取消该订单吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await cancelOrder(orderId)
            setOrders(prev => prev.map(order =>
              order.id === orderId ? { ...order, status: 'cancelled' } : order
            ))
            Taro.showToast({ title: '取消成功', icon: 'success' })
          } catch (err) {
            Taro.showToast({ title: '取消失败', icon: 'none' })
          }
        }
      }
    })
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  }

  // 空状态
  if (!loading && orders.length === 0 && activeStatus === '') {
    return (
      <View className='op16'>
        <View className='empty-container'>
          <Image src='https://img.icons8.com/ios/452/nothing-found.png' className='empty-image' mode='aspectFit' />
          <Text className='empty-text'>暂无订单</Text>
          <Text className='empty-tip'>去预订酒店，开启美好旅程</Text>
          <View className='empty-actions'>
            <View className='btn primary' onClick={() => Taro.reLaunch({ url: '/pages/op1/op1' })}>去首页</View>
            <View className='btn secondary' onClick={() => Taro.reLaunch({ url: '/pages/op14/op14' })}>去列表</View>
          </View>
        </View>
        <BottomNav currentPath={currentPath} />
      </View>
    )
  }

  return (
    <View className='op16'>
      {/* 状态标签 */}
      <View className='status-tabs'>
        {statusTabs.map(tab => (
          <Text
            key={tab.key}
            className={`tab ${activeStatus === tab.key ? 'active' : ''}`}
            onClick={() => setActiveStatus(tab.key)}
          >
            {tab.text}
          </Text>
        ))}
      </View>

      <ScrollView
        scrollY
        className='order-scroll'
        onScrollToLower={() => {
          if (hasMore && !loading) {
            loadOrders(page + 1, activeStatus)
          }
        }}
        lowerThreshold={50}
        enhanced
        showScrollbar={false}
      >
        {orders.length === 0 && !loading ? (
          <View className='empty-in-list'>
            <Text className='empty-text'>暂无{statusTabs.find(t => t.key === activeStatus)?.text || ''}订单</Text>
          </View>
        ) : (
          orders.map(order => {
            const statusInfo = statusMap[order.status] || { text: order.status, color: '#999', bg: '#f5f5f5' }
            return (
              <View key={order.id} className='order-card'>
                <Image src={order.hotelImage} className='hotel-img' mode='aspectFill' />
                <View className='order-info'>
                  <View className='order-header'>
                    <Text className='hotel-name'>{order.hotelName}</Text>
                    <View className='status-badge' style={{ backgroundColor: statusInfo.bg }}>
                      <Text className='status-text' style={{ color: statusInfo.color }}>{statusInfo.text}</Text>
                    </View>
                  </View>
                  <Text className='room-type'>{order.roomTypeName}</Text>
                  <Text className='date'>{formatDate(order.checkIn)} - {formatDate(order.checkOut)} 共{order.nights}晚</Text>
                  <View className='price-row'>
                    <Text className='total-price'>¥{order.totalPrice}</Text>
                    <View className='actions'>
                      {order.status === 'pending' && (
                        <Text className='action-btn cancel' onClick={() => handleCancel(order.id)}>取消订单</Text>
                      )}
                      {order.status === 'confirmed' && (
                        <Text className='action-btn contact'>联系酒店</Text>
                      )}
                      {order.status === 'completed' && (
                        <Text className='action-btn review'>去评价</Text>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            )
          })
        )}
        {loading && (
          <View className='loading-container'>
            <Text className='loading-text'>加载中...</Text>
          </View>
        )}
        {!hasMore && orders.length > 0 && (
          <View className='no-more-container'>
            <Text className='no-more-text'>没有更多了</Text>
          </View>
        )}
      </ScrollView>

      <BottomNav currentPath={currentPath} />
    </View>
  )
}