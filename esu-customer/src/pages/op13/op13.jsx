import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import './op13.scss'

// 引入腾讯地图 SDK
const QQMapWX = require('qqmap-wx-jssdk')
let qqmapsdk

// 热门城市数据
const hotCities = ['北京', '上海', '三亚', '广州', '香港', '深圳', '南京', '成都' /* ... */]

// 城市分组数据（按字母索引）
const cityGroups = {
  A: ['澳门', '阿巴嘎旗', '阿坝县', '阿尔山' /* ... */],
  B: ['北京', '保定', '包头', '北海' /* ... */],
  // ... 其他字母分组
}

const alphabet = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z']

export default function CitySelect() {
  const [searchText, setSearchText] = useState('')
  const [history, setHistory] = useState(['北京·武汉大厦酒店(…)', '北京·武汉', '北京', '北京·沙井胡同', '北京·沙井', '西安'])
  const [currentCity, setCurrentCity] = useState('') // 当前定位城市

  // 初始化腾讯地图 SDK
  useEffect(() => {
    qqmapsdk = new QQMapWX({
      key: 'GKVBZ-3JA64-CH7UD-FJRJE-7FLHK-NDFJO' // ⚠️ 替换为你的 Key
    })
  }, [])

  // 获取定位
  const getLocation = () => {
    Taro.getLocation({
      type: 'gcj02', // 使用 gcj02 坐标系 [citation:3]
      success: (res) => {
        const { latitude, longitude } = res
        // 逆地址解析：经纬度转城市名 [citation:3][citation:5]
        qqmapsdk.reverseGeocoder({
          location: { latitude, longitude },
          success: (result) => {
            const city = result.result.address_component.city
            setCurrentCity(city)
            // 可选：自动选中城市并返回首页
            // selectCity(city)
          },
          fail: (err) => {
            console.error('逆地址解析失败', err)
            Taro.showToast({ title: '定位失败', icon: 'none' })
          }
        })
      },
      fail: (err) => {
        console.error('获取定位失败', err)
        Taro.showToast({ title: '定位失败，请手动选择城市', icon: 'none' })
      }
    })
  }

  // 页面显示时自动定位 [citation:6]
  useDidShow(() => {
    getLocation()
  })

  // 选择城市
  const selectCity = (city) => {
    Taro.eventCenter.trigger('citySelected', city)
    Taro.navigateBack()
  }

  // 处理搜索
  const handleSearch = () => {
    if (!searchText.trim()) return
    selectCity(searchText)
  }

  // 清空历史
  const clearHistory = () => {
    setHistory([])
  }

  // 滚动到指定字母
  const scrollToLetter = (letter) => {
    Taro.pageScrollTo({
      selector: `#group-${letter}`,
      duration: 300
    })
  }

  return (
    <View className='city-select'>
      {/* 顶部搜索栏 */}
      <View className='search-header'>
        <View className='search-box'>
          <Text className='search-icon'>🔍</Text>
          <Input
            className='search-input'
            placeholder='全球城市/区域/位置/酒店'
            value={searchText}
            onInput={e => setSearchText(e.detail.value)}
            onConfirm={handleSearch}
          />
        </View>
        <Text className='cancel-btn' onClick={() => Taro.navigateBack()}>取消</Text>
      </View>

      {/* 定位提示 - 显示当前城市 */}
      <View className='location-tip' onClick={getLocation}>
        <Text className='icon'>📍</Text>
        <Text className='text'>
          {currentCity ? `当前定位：${currentCity}` : '点击重新定位'}
        </Text>
      </View>

      <ScrollView scrollY className='scroll-view' scrollWithAnimation>
        {/* 历史搜索 */}
        {history.length > 0 && (
          <View className='section'>
            <View className='section-header'>
              <Text className='title'>历史搜索</Text>
              <Text className='clear' onClick={clearHistory}>🗑️</Text>
            </View>
            <View className='history-tags'>
              {history.map((item, index) => (
                <Text key={index} className='tag' onClick={() => selectCity(item)}>{item}</Text>
              ))}
            </View>
          </View>
        )}

        {/* 热门城市 */}
        <View className='section'>
          <View className='section-header'>
            <Text className='title'>国内热门城市</Text>
          </View>
          <View className='hot-grid'>
            {hotCities.map(city => (
              <Text key={city} className='hot-item' onClick={() => selectCity(city)}>{city}</Text>
            ))}
          </View>
        </View>

        {/* 字母分组城市 */}
        {alphabet.map(letter => (
          cityGroups[letter] && cityGroups[letter].length > 0 && (
            <View key={letter} id={`group-${letter}`} className='city-group'>
              <Text className='group-letter'>{letter}</Text>
              {cityGroups[letter].map(city => (
                <Text key={city} className='city-item' onClick={() => selectCity(city)}>{city}</Text>
              ))}
            </View>
          )
        ))}
      </ScrollView>

      {/* 右侧字母索引 */}
      <View className='alphabet-index'>
        {alphabet.map(letter => (
          <Text key={letter} className='letter' onClick={() => scrollToLetter(letter)}>{letter}</Text>
        ))}
      </View>
    </View>
  )
}