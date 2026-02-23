import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import './BottomNav.scss'

const HomeIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12L5 10M5 10L12 3L19 10M5 10V20C5 20.5523 5.44772 21 6 21H9M19 10L21 12M19 10V20C19 20.5523 18.5523 21 18 21H15M9 21C9.55228 21 10 20.5523 10 20V16C10 15.4477 10.4477 15 11 15H13C13.5523 15 14 15.4477 14 16V20C14 20.5523 14.4477 21 15 21M9 21H15" 
      stroke={active ? '#0086f6' : '#555'} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

const ListIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 6H21M8 12H21M8 18H21M3 6H3.01M3 12H3.01M3 18H3.01" 
      stroke={active ? '#0086f6' : '#555'} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

const HeartIcon = ({ active }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? '#0086f6' : 'none'} xmlns="http://www.w3.org/2000/svg">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" 
      stroke={active ? '#0086f6' : '#555'} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

const OrderIcon = ({ active }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" 
      stroke={active ? '#0086f6' : '#555'} 
      strokeWidth="2.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    />
  </svg>
)

const tabList = [
  { pagePath: '/pages/op1/op1', text: '首页', Icon: HomeIcon },
  { pagePath: '/pages/op14/op14', text: '列表', Icon: ListIcon },
  { pagePath: '/pages/op15/op15', text: '收藏', Icon: HeartIcon },
  { pagePath: '/pages/op16/op16', text: '订单', Icon: OrderIcon },
]

export default function BottomNav({ currentPath }) {
  const switchTab = (path) => {
    console.log('点击跳转:', path)
    if (currentPath === path) {
      console.log('当前页面，不跳转')
      return
    }
    Taro.reLaunch({ url: path })
  }

  return (
    <View className='bottom-nav'>
      {tabList.map(item => {
        const isActive = currentPath === item.pagePath
        return (
          <View
            key={item.pagePath}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => switchTab(item.pagePath)}
          >
            <item.Icon active={isActive} />
            <Text className='text'>{item.text}</Text>
          </View>
        )
      })}
    </View>
  )
}
