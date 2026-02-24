import Taro from '@tarojs/taro'

export const isLoggedIn = () => {
  const token = Taro.getStorageSync('token')
  return !!token
}

export const requireLogin = (targetUrl, options = {}) => {
  if (isLoggedIn()) {
    return true
  }
  
  Taro.navigateTo({
    url: `/pages/login/login?redirect=${encodeURIComponent(targetUrl)}`
  })
  return false
}

export const getUserInfo = () => {
  return Taro.getStorageSync('userInfo') || null
}

export const logout = () => {
  Taro.removeStorageSync('token')
  Taro.removeStorageSync('userInfo')
  Taro.showToast({ title: '已退出登录', icon: 'none' })
}
