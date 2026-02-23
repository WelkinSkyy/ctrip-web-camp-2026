import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import './op12.scss'

const HISTORY_KEY = 'search_history'
const MAX_HISTORY = 10

export default function Search() {
  const [inputValue, setInputValue] = useState('')
  const [historyList, setHistoryList] = useState([])

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = () => {
    try {
      const history = Taro.getStorageSync(HISTORY_KEY) || []
      setHistoryList(history)
    } catch (e) {
      setHistoryList([])
    }
  }

  const saveHistory = (keyword) => {
    if (!keyword.trim()) return
    let newHistory = [keyword, ...historyList.filter(item => item !== keyword)]
    if (newHistory.length > MAX_HISTORY) {
      newHistory = newHistory.slice(0, MAX_HISTORY)
    }
    try {
      Taro.setStorageSync(HISTORY_KEY, newHistory)
      setHistoryList(newHistory)
    } catch (e) {
      console.error('保存历史记录失败', e)
    }
  }

  const handleSearch = (keyword) => {
    const searchKeyword = keyword || inputValue
    if (searchKeyword.trim()) {
      saveHistory(searchKeyword.trim())
      Taro.eventCenter.trigger('searchKeywordSelected', searchKeyword.trim())
    }
    Taro.navigateBack()
  }

  const handleClearHistory = () => {
    Taro.showModal({
      title: '提示',
      content: '确定清空历史记录吗？',
      success: (res) => {
        if (res.confirm) {
          Taro.removeStorageSync(HISTORY_KEY)
          setHistoryList([])
        }
      }
    })
  }

  const handleDeleteItem = (e, index) => {
    e.stopPropagation()
    const newHistory = historyList.filter((_, i) => i !== index)
    Taro.setStorageSync(HISTORY_KEY, newHistory)
    setHistoryList(newHistory)
  }

  const hotKeywords = ['双峰', '希尔顿', '维也纳', '智尚酒店', '大床房', '亲子酒店']

  return (
    <View className='search-page'>
      <View className='search-header'>
        <View className='search-input-wrapper'>
          <Text className='search-icon'>🔍</Text>
          <Input
            className='search-input'
            placeholder='输入酒店、目的地'
            value={inputValue}
            onInput={e => setInputValue(e.detail.value)}
            onConfirm={() => handleSearch()}
            autoFocus
          />
          {inputValue && (
            <Text className='clear-icon' onClick={() => setInputValue('')}>✕</Text>
          )}
        </View>
        <Text className='search-btn' onClick={() => handleSearch()}>搜索</Text>
      </View>

      <ScrollView scrollY className='search-content'>
        {/* 历史搜索 */}
        {historyList.length > 0 && (
          <View className='section'>
            <View className='section-header'>
              <Text className='section-title'>历史搜索</Text>
              <Text className='clear-btn' onClick={handleClearHistory}>清空</Text>
            </View>
            <View className='tag-list'>
              {historyList.map((item, index) => (
                <View 
                  key={index} 
                  className='tag-item history'
                  onClick={() => handleSearch(item)}
                >
                  <Text className='tag-text'>{item}</Text>
                  <Text className='delete-icon' onClick={(e) => handleDeleteItem(e, index)}>✕</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 热门搜索 */}
        <View className='section'>
          <View className='section-header'>
            <Text className='section-title'>热门搜索</Text>
          </View>
          <View className='tag-list'>
            {hotKeywords.map((item, index) => (
              <View 
                key={index} 
                className='tag-item hot'
                onClick={() => handleSearch(item)}
              >
                <Text className='tag-text'>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
