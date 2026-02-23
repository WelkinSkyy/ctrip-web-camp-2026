import { useState } from 'react'
import { View, Input, Button, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { login, register } from '../../un/api'
import './login.scss'

export default function Login() {
  const [isLogin, setIsLogin] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!username.trim()) {
      Taro.showToast({ title: '请输入用户名', icon: 'none' })
      return
    }
    if (!password.trim()) {
      Taro.showToast({ title: '请输入密码', icon: 'none' })
      return
    }
    if (!isLogin && password !== confirmPassword) {
      Taro.showToast({ title: '两次密码不一致', icon: 'none' })
      return
    }

    setLoading(true)
    try {
      if (isLogin) {
        const res = await login(username, password)
        Taro.setStorageSync('token', res.token)
        Taro.setStorageSync('userInfo', res.user)
        Taro.showToast({ title: '登录成功', icon: 'success' })
        setTimeout(() => {
          Taro.switchTab({ url: '/pages/op1/op1' })
        }, 1500)
      } else {
        await register(username, password)
        Taro.showToast({ title: '注册成功，请登录', icon: 'success' })
        setIsLogin(true)
      }
    } catch (error) {
      console.error('Auth error:', error)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setIsLogin(!isLogin)
    setPassword('')
    setConfirmPassword('')
  }

  return (
    <View className='login-container'>
      <View className='login-header'>
        <Text className='login-title'>易宿酒店预订</Text>
        <Text className='login-subtitle'>{isLogin ? '欢迎回来' : '创建新账户'}</Text>
      </View>

      <View className='login-form'>
        <View className='form-item'>
          <Text className='form-label'>用户名</Text>
          <Input
            className='form-input'
            placeholder='请输入用户名'
            value={username}
            onInput={(e) => setUsername(e.detail.value)}
          />
        </View>

        <View className='form-item'>
          <Text className='form-label'>密码</Text>
          <Input
            className='form-input'
            type='password'
            placeholder='请输入密码'
            value={password}
            onInput={(e) => setPassword(e.detail.value)}
          />
        </View>

        {!isLogin && (
          <View className='form-item'>
            <Text className='form-label'>确认密码</Text>
            <Input
              className='form-input'
              type='password'
              placeholder='请再次输入密码'
              value={confirmPassword}
              onInput={(e) => setConfirmPassword(e.detail.value)}
            />
          </View>
        )}

        <Button
          className='submit-btn'
          onClick={handleSubmit}
          loading={loading}
          disabled={loading}
        >
          {isLogin ? '登录' : '注册'}
        </Button>

        <View className='switch-mode'>
          <Text className='switch-text'>
            {isLogin ? '还没有账户？' : '已有账户？'}
          </Text>
          <Text className='switch-link' onClick={switchMode}>
            {isLogin ? '立即注册' : '去登录'}
          </Text>
        </View>
      </View>
    </View>
  )
}
