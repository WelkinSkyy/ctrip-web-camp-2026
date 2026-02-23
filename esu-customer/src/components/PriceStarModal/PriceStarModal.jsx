import { View, Text } from '@tarojs/components'
import { useState, useEffect, useRef } from 'react'
import './PriceStarModal.scss'

// 星级选项（不变）
const starOptions = [
  { key: '2', label: '2星/钻及以下', sub: '经济' },
  { key: '3', label: '3星/钻', sub: '舒适' },
  { key: '4', label: '4星/钻', sub: '高档' },
  { key: '5', label: '5星/钻', sub: '豪华' },
  { key: '6', label: '金钻', sub: '奢华体验' },
  { key: '7', label: '铂钻', sub: '超奢品质' },
]

// 新增：快捷价格标签数据
const priceTags = [
  { label: '¥100以下', min: 0, max: 100 },
  { label: '¥100-150', min: 100, max: 150 },
  { label: '¥150-200', min: 150, max: 200 },
  { label: '¥200-250', min: 200, max: 250 },
  { label: '¥250-300', min: 250, max: 300 },
  { label: '¥300-350', min: 300, max: 350 },
  { label: '¥350-400', min: 350, max: 400 },
  { label: '¥400以上', min: 400, max: 1300 }, // 上限与滑块一致
]

export default function PriceStarModal({
  visible,
  onClose,
  onConfirm,
  initialPrice = [0, 1300],
  initialStars = []
}) {
  const [priceMin, setPriceMin] = useState(initialPrice[0])
  const [priceMax, setPriceMax] = useState(initialPrice[1])
  const [selectedStars, setSelectedStars] = useState(initialStars)
  const [dragging, setDragging] = useState(null) // 'min' or 'max'

  // 新增：当前选中的价格标签（用于高亮）
  const [activePriceTag, setActivePriceTag] = useState(null)

  const trackRef = useRef(null)
  const min = 0
  const max = 1300

  // 当弹窗打开时，根据 initialPrice 匹配标签（如果有）
  useEffect(() => {
    if (visible) {
      // 匹配价格标签
      const matchedTag = priceTags.find(
        tag => tag.min === priceMin && tag.max === priceMax
      )
      setActivePriceTag(matchedTag ? matchedTag.label : null)
    }
  }, [visible, priceMin, priceMax])

  // 确保最小值≤最大值
  useEffect(() => {
    if (priceMin > priceMax) {
      setPriceMax(priceMin)
    }
  }, [priceMin, priceMax])

  // 监听价格变化：如果当前激活的标签与实时价格不匹配，则清除标签高亮
  useEffect(() => {
    if (activePriceTag) {
      const tag = priceTags.find(t => t.label === activePriceTag)
      if (tag && (tag.min !== priceMin || tag.max !== priceMax)) {
        setActivePriceTag(null) // 价格偏离标签范围，取消高亮
      }
    }
  }, [priceMin, priceMax, activePriceTag])

  // 计算滑块位置百分比
  const minPercent = ((priceMin - min) / (max - min)) * 100
  const maxPercent = ((priceMax - min) / (max - min)) * 100

  // 处理触摸移动（滑块拖动）
  const handleTouchMove = (e) => {
    if (!dragging || !trackRef.current) return

    const trackRect = trackRef.current.getBoundingClientRect()
    const touch = e.touches[0]
    const clientX = touch.clientX
    let percent = (clientX - trackRect.left) / trackRect.width
    percent = Math.max(0, Math.min(1, percent))
    const newValue = Math.round(min + percent * (max - min))

    if (dragging === 'min') {
      setPriceMin(Math.min(newValue, priceMax))
    } else if (dragging === 'max') {
      setPriceMax(Math.max(newValue, priceMin))
    }
  }

  const handleTouchEnd = () => {
    setDragging(null)
  }

  useEffect(() => {
    if (dragging) {
      document.addEventListener('touchmove', handleTouchMove)
      document.addEventListener('touchend', handleTouchEnd)
    } else {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
    return () => {
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [dragging])

  // 星级点击（改为单选）
  const handleStarClick = (key) => {
    setSelectedStars(prev => prev.includes(key) ? [] : [key])
  }

  // 新增：价格标签点击
  const handlePriceTagClick = (tag) => {
    setPriceMin(tag.min)
    setPriceMax(tag.max)
    setActivePriceTag(tag.label) // 高亮当前标签
  }

  const handleConfirm = () => {
    onConfirm({
      price: [priceMin, priceMax],
      stars: selectedStars,
    })
    onClose()
  }

  const handleClear = () => {
    setPriceMin(0)
    setPriceMax(1300)
    setSelectedStars([])
    setActivePriceTag(null) // 清空标签高亮
  }

  if (!visible) return null

  return (
    <View className={`price-star-modal-mask ${visible ? 'active' : ''}`} onClick={onClose}>
      <View className='price-star-modal-content' onClick={e => e.stopPropagation()}>
        <View className='modal-header'>
          <Text className='cancel' onClick={onClose}>取消</Text>
          <Text className='title'>价格/星级</Text>
          <Text className='confirm' onClick={handleConfirm}>完成</Text>
        </View>

        {/* 价格滑块区域 */}
        <View className='price-section'>
          <Text className='section-title'>价格</Text>
          <View className='custom-slider-container'>
            <View className='slider-track' ref={trackRef}>
              <View
                className='slider-fill'
                style={{
                  left: `${minPercent}%`,
                  width: `${maxPercent - minPercent}%`,
                }}
              />
              <View
                className='slider-handle min'
                style={{ left: `${minPercent}%` }}
                onTouchStart={() => setDragging('min')}
              >
                <View className='handle-dot' />
              </View>
              <View
                className='slider-handle max'
                style={{ left: `${maxPercent}%` }}
                onTouchStart={() => setDragging('max')}
              >
                <View className='handle-dot' />
              </View>
            </View>
            <View className='price-labels'>
              <Text>¥{priceMin}</Text>
              <Text>¥{priceMax}</Text>
            </View>
          </View>

          {/* 新增：快捷价格标签 */}
          <View className='price-tags'>
            {priceTags.map(tag => (
              <Text
                key={tag.label}
                className={`price-tag ${activePriceTag === tag.label ? 'active' : ''}`}
                onClick={() => handlePriceTagClick(tag)}
              >
                {tag.label}
              </Text>
            ))}
          </View>
        </View>

        {/* 星级选择（不变） */}
        <View className='star-section'>
          <View className='section-header'>
            <Text className='section-title'>星级/钻级</Text>
            <Text className='section-link'>国内星级/钻级说明 &gt;</Text>
          </View>
          <View className='star-options'>
            {starOptions.map(star => (
              <View
                key={star.key}
                className={`star-option ${selectedStars.includes(star.key) ? 'active' : ''}`}
                onClick={() => handleStarClick(star.key)}
              >
                <Text className='label'>{star.label}</Text>
                <Text className='sub'>{star.sub}</Text>
              </View>
            ))}
          </View>
          <Text className='footnote'>钻级由携程评定，综合考虑酒店设施和服务水平得出，仅供参考</Text>
        </View>

        {/* 底部按钮（不变） */}
        <View className='modal-footer'>
          <Text className='clear-btn' onClick={handleClear}>清空</Text>
          <Text className='confirm-btn' onClick={handleConfirm}>完成</Text>
        </View>
      </View>
    </View>
  )
}