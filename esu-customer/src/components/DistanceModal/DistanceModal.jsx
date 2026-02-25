import { View, Text } from '@tarojs/components'
import { useState, useEffect } from 'react'
import './DistanceModal.scss'

const distanceOptions = [
  { label: '500米内', value: 500 },
  { label: '1公里内', value: 1000 },
  { label: '2公里内', value: 2000 },
  { label: '5公里内', value: 5000 },
]

export default function DistanceModal({
  visible = false,
  onClose = () => {},
  onConfirm = () => {},
  currentDistance = null,
  top = 0
}) {
  const [selected, setSelected] = useState(currentDistance ?? null)

  // 打开模态或 currentDistance 改变时同步 selected
  useEffect(() => {
    if (visible) {
      setSelected(currentDistance ?? null)
    }
  }, [visible, currentDistance])

  // 锁定 body 滚动（仅 H5/web）
  useEffect(() => {
    if (!visible) return
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [visible])

  // ESC 关闭（仅 H5）
  useEffect(() => {
    if (!visible) return
    if (typeof document === 'undefined') return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [visible, onClose])

  const handleSelect = (value) => {
    setSelected(prev => (prev === value ? null : value))
  }

  const handleClear = () => {
    setSelected(null)
  }

  const handleConfirm = () => {
    onConfirm(selected) // 可能为 null，表示不限
    onClose()
  }

  if (!visible) return null

  return (
    <View
      className={`distance-modal-mask ${visible ? 'active' : ''}`}
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-label='选择位置距离'
    >
      <View className='distance-modal-content' onClick={e => e.stopPropagation()}>
        <View className='modal-header'>
          <Text className='cancel' onClick={onClose} role='button' aria-label='取消'>取消</Text>
          <Text className='title'>位置距离</Text>
          <Text className='confirm' onClick={handleConfirm} role='button' aria-label='完成'>完成</Text>
        </View>

        <View className='modal-body' role='list'>
          {distanceOptions.map(opt => {
            const isSelected = selected === opt.value
            return (
              <View
                key={opt.value}
                className={`option-item ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
                role='button'
                aria-pressed={isSelected}
                aria-label={opt.label}
              >
                <Text className='label'>{opt.label}</Text>
                {isSelected && <View className='check' aria-hidden='true'>✓</View>}
              </View>
            )
          })}
        </View>

        <View className='modal-footer'>
          <View className='btn clear-btn' onClick={handleClear} role='button' aria-label='清空'>清空</View>
          <View className='btn confirm-btn' onClick={handleConfirm} role='button' aria-label='完成'>完成</View>
        </View>
      </View>
    </View>
  )
}