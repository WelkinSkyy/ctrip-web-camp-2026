import { View, Text } from '@tarojs/components'
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
  const handleSelect = (key) => {
    onSelect(key)
    onClose()
  }

  if (!visible) return null

  return (
    <View className='sort-modal-mask' onClick={onClose}>
      <View className='sort-modal-content' onClick={e => e.stopPropagation()}>
        {sortOptions.map(opt => (
          <View
            key={opt.key}
            className={`sort-option ${currentSort === opt.key ? 'active' : ''}`}
            onClick={() => handleSelect(opt.key)}
          >
            <Text className='label'>{opt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
