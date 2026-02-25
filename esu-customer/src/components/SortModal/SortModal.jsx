import { View, Text } from '@tarojs/components'
import { useState, useEffect } from 'react'
import './SortModal.scss'

const sortOptions = [
  { key: 'smart', label: '智能排序' },
  { key: 'distance_asc', label: '直线距离 近→远' },
  { key: 'score_desc', label: '好评优先' },
  { key: 'price_asc', label: '低价优先' },
  { key: 'price_desc', label: '高价优先' },
  { key: 'stars_desc', label: '高星优先' },
]

export default function SortModal({ visible, onClose, onSelect, currentSort }) {
  const [selectedSort, setSelectedSort] = useState(currentSort)

  useEffect(() => {
    setSelectedSort(currentSort)
  }, [currentSort])

  const handleSelect = (key) => {
    setSelectedSort(key)
  }

  const handleConfirm = () => {
    onSelect(selectedSort)
    onClose()
  }

  const handleClear = () => {
    setSelectedSort('smart')
  }

  if (!visible) return null

  return (
    <View className={`sort-modal-mask ${visible ? 'active' : ''}`} onClick={onClose}>
      <View className='sort-modal-content' onClick={e => e.stopPropagation()}>
        <View className='modal-header'>
          <Text className='cancel' onClick={onClose}>取消</Text>
          <Text className='title'>智能排序</Text>
          <Text className='confirm' onClick={handleConfirm}>完成</Text>
        </View>

        <View className='sort-options'>
          {sortOptions.map(opt => (
            <View
              key={opt.key}
              className={`sort-option ${selectedSort === opt.key ? 'active' : ''}`}
              onClick={() => handleSelect(opt.key)}
            >
              <Text className='label'>{opt.label}</Text>
              {selectedSort === opt.key && <Text className='check'>✓</Text>}
            </View>
          ))}
        </View>

        <View className='modal-footer'>
          <Text className='clear-btn' onClick={handleClear}>清空</Text>
          <Text className='confirm-btn' onClick={handleConfirm}>完成</Text>
        </View>
      </View>
    </View>
  )
}
