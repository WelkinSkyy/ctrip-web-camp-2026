import { View, Text, ScrollView, Button } from '@tarojs/components'
import { useState, useEffect, useMemo } from 'react'
import './FilterModal.scss'

// 模拟筛选分类数据（静态）
const filterSections = [
  // ... 数据保持不变，略（与之前相同）
  {
    id: 'history',
    title: '历史筛选',
    expanded: true,
    multiple: true,
    options: [
      { label: '双床房', value: 'twin' },
      { label: '免费停车场', value: 'freeParking' },
      { label: '4.7分以上', value: 'highScore' },
      { label: '含早餐', value: 'breakfast' },
    ]
  },
  {
    id: 'hot',
    title: '热门筛选',
    expanded: true,
    multiple: true,
    options: [
      { label: '双床房', value: 'twin' },
      { label: '上榜酒店', value: 'topListed' },
      { label: '双床房', value: 'twin2' },
      { label: '电竞酒店', value: 'eSports' },
      { label: '免费停车场', value: 'freeParking' },
      { label: '家庭房', value: 'family' },
      { label: '可携带宠物', value: 'petFriendly' },
      { label: '4.7分以上', value: 'highScore' },
      { label: '含早餐', value: 'breakfast' },
      { label: '钟点房', value: 'hourly' },
    ]
  },
  {
    id: 'roomLayout',
    title: '房间布局',
    expanded: false,
    multiple: true,
    options: [
      { label: '单间/单卧室', value: 'single' },
      { label: '2间卧室', value: 'twoBedroom' },
      { label: '独享整套', value: 'entire' },
      { label: '多卫生间', value: 'multiBath' },
      { label: '洗衣机', value: 'washer' },
      { label: '厨房', value: 'kitchen' },
    ]
  },
  {
    id: 'accommodationType',
    title: '住宿类型',
    expanded: false,
    multiple: true,
    options: [
      { label: '酒店', value: 'hotel' },
      { label: '民宿', value: 'homestay' },
      { label: '旅馆', value: 'inn' },
      { label: '酒店公寓', value: 'aptHotel' },
      { label: '客栈', value: 'hostel' },
      { label: '钟点房', value: 'hourly' },
    ]
  },
  {
    id: 'theme',
    title: '主题特色',
    expanded: false,
    multiple: true,
    options: [
      { label: '电竞酒店', value: 'eSports' },
      { label: '上榜酒店', value: 'topListed' },
      { label: '窗外好景', value: 'goodView' },
      { label: '自助入住', value: 'selfCheckin' },
    ]
  },
  {
    id: 'brand',
    title: '品牌',
    expanded: false,
    multiple: true,
    options: [
      { label: 'OYO酒店', value: 'oyo' },
      { label: '莫林风尚', value: 'morlin' },
      { label: '尚客优', value: 'thankyou' },
      { label: '维也纳3好', value: 'vienna3' },
      { label: '赫柏酒店', value: 'hebo' },
      { label: '维也纳国际', value: 'viennaIntl' },
      { label: '廷泊', value: 'tingbo' },
    ]
  },
  {
    id: 'facility',
    title: '酒店设施',
    expanded: false,
    multiple: true,
    options: [
      { label: '免费停车场', value: '免费停车场' },
      { label: '可携带宠物', value: '可携带宠物' },
      { label: '健身室', value: '健身室' },
      { label: '24小时前台', value: '24小时前台' },
      { label: '有行李寄存服务', value: '有行李寄存服务' },
      { label: '停车场', value: '停车场' },
    ]
  },
  {
    id: 'openTime',
    title: '开业/装修时间',
    expanded: false,
    multiple: false,
    options: [
      { label: '6个月以内', value: 'within6m' },
      { label: '1年以内', value: 'within1y' },
      { label: '2年以内', value: 'within2y' },
    ]
  },
  {
    id: 'roomFacility',
    title: '客房设施',
    expanded: false,
    multiple: true,
    options: [
      { label: '私人卫生间', value: 'privateBath' },
      { label: '空调', value: 'ac' },
      { label: '电热水壶', value: 'kettle' },
    ]
  },
  {
    id: 'bedType',
    title: '床型',
    expanded: false,
    multiple: true,
    options: [
      { label: '大床房', value: 'king' },
      { label: '双床房', value: 'twin' },
      { label: '单人床房', value: 'singleBed' },
    ]
  },
  {
    id: 'bedroomCount',
    title: '卧室数',
    expanded: false,
    multiple: true,
    options: [
      { label: '单间/单卧室', value: 'single' },
      { label: '2间卧室', value: 'twoBedroom' },
    ]
  },
  {
    id: 'meal',
    title: '餐食',
    expanded: false,
    multiple: true,
    options: [
      { label: '含早餐', value: 'breakfast' },
      { label: '单份早餐', value: 'singleBreakfast' },
      { label: '双份早餐', value: 'doubleBreakfast' },
      { label: '含晚餐', value: 'dinner' },
      { label: '单份晚餐', value: 'singleDinner' },
      { label: '双份晚餐', value: 'doubleDinner' },
    ]
  },
  {
    id: 'roomArea',
    title: '房间面积',
    expanded: false,
    multiple: true,
    options: [
      { label: '≥ 30㎡', value: 'ge30' },
      { label: '≥ 40㎡', value: 'ge40' },
    ]
  },
  {
    id: 'score',
    title: '评分',
    expanded: false,
    multiple: true,
    options: [
      { label: '4.7分以上', value: 'ge47' },
      { label: '4.5分以上', value: 'ge45' },
      { label: '4.0分以上', value: 'ge40' },
    ]
  },
  {
    id: 'reviewCount',
    title: '点评数',
    expanded: false,
    multiple: true,
    options: [
      { label: '200条以上', value: 'ge200' },
      { label: '100条以上', value: 'ge100' },
      { label: '50条以上', value: 'ge50' },
    ]
  },
  {
    id: 'guestImpression',
    title: '住客印象',
    expanded: false,
    multiple: true,
    options: [
      { label: '位置超好', value: 'goodLocation' },
      { label: '活动丰富', value: 'manyActivities' },
      { label: '干净卫生', value: 'clean' },
    ]
  },
  {
    id: 'benefits',
    title: '权益/促销',
    expanded: false,
    multiple: true,
    options: [
      { label: '体验·钻石会员权益', value: 'diamond' },
      { label: '返10倍积分', value: 'points10x' },
      { label: '免费兑早餐', value: 'freeBreakfast' },
    ]
  },
  {
    id: 'service',
    title: '携程服务',
    expanded: false,
    multiple: true,
    options: [
      { label: '立即确认', value: 'instantConfirm' },
      { label: '免费取消', value: 'freeCancel' },
    ]
  },
  {
    id: 'invoice',
    title: '发票',
    expanded: false,
    multiple: true,
    options: [
      { label: '携程开票', value: 'ctripInvoice' },
      { label: '酒店开票', value: 'hotelInvoice' },
    ]
  },
  {
    id: 'payment',
    title: '支付方式',
    expanded: false,
    multiple: true,
    options: [
      { label: '在线付款', value: 'onlinePay' },
      { label: '到店付款', value: 'payAtHotel' },
    ]
  },
  {
    id: 'applicable',
    title: '适用人群',
    expanded: false,
    multiple: true,
    options: [
      { label: '香港客人适用', value: 'hk' },
      { label: '澳门客人适用', value: 'macau' },
      { label: '台湾客人适用', value: 'taiwan' },
    ]
  },
]

export default function FilterModal({
  visible = false,
  onClose = () => {},
  onConfirm = () => {},
  initialFilters = {}
}) {
  // 初始展开状态
  const initialExpanded = useMemo(() => {
    return filterSections.reduce((acc, section) => {
      acc[section.id] = !!section.expanded
      return acc
    }, {})
  }, [])

  const [expandedSections, setExpandedSections] = useState(initialExpanded)

  // 存储每个分类选中的选项值（数组），格式: { sectionId: ['value1','value2'], ... }
  const [selected, setSelected] = useState({})

  // 当模态打开时（或 initialFilters 变化）重置 selected 和展开状态
  useEffect(() => {
    if (visible) {
      // 规范化 initialFilters：确保每个值是数组
      const normalized = {}
      Object.entries(initialFilters || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          normalized[key] = value
        } else if (value !== undefined && value !== null) {
          // 如果是非数组（例如单个字符串），转为数组
          normalized[key] = [value]
        }
      })
      setSelected(normalized)
      setExpandedSections(initialExpanded)
    }
  }, [visible, initialFilters, initialExpanded])

  // 锁定 body 滚动（仅 H5 环境）
  useEffect(() => {
    if (!visible) return
    if (typeof document !== 'undefined') {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prev
      }
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

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  const handleOptionClick = (section, optionValue) => {
    setSelected(prev => {
      const current = prev[section.id] || [] // 确保是数组
      let newSelected
      if (section.multiple) {
        if (current.includes(optionValue)) {
          newSelected = current.filter(v => v !== optionValue)
        } else {
          newSelected = [...current, optionValue]
        }
      } else {
        // 单选：直接替换为单值数组
        newSelected = [optionValue]
      }
      return {
        ...prev,
        [section.id]: newSelected
      }
    })
  }

  const handleClearAll = () => {
    setSelected({})
  }

  const handleRemoveTag = (sectionId, value) => {
    setSelected(prev => {
      const arr = (prev[sectionId] || []).filter(v => v !== value)
      const next = { ...prev }
      if (arr.length === 0) {
        delete next[sectionId]
      } else {
        next[sectionId] = arr
      }
      return next
    })
  }

  const handleConfirm = () => {
    onConfirm(selected)
    onClose()
  }

  // 帮助方法：根据 sectionId + value 查 label（回退到 value）
  const getLabel = (sectionId, value) => {
    const section = filterSections.find(s => s.id === sectionId)
    if (!section) {
      // 如果没找到，尝试在所有 options 中查找（兼容重复值但不同 section 的情况）
      for (const s of filterSections) {
        const opt = s.options.find(o => o.value === value)
        if (opt) return opt.label
      }
      return value
    }
    const opt = section.options.find(o => o.value === value)
    return opt ? opt.label : value
  }

  if (!visible) return null

  return (
    <View
      className='filter-modal-mask'
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-label='筛选'
    >
      <View className='filter-modal-content' onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <View className='filter-header'>
          <Text className='cancel' onClick={onClose}>取消</Text>
          <Text className='title'>筛选</Text>
          <Text className='confirm' onClick={handleConfirm}>完成</Text>
        </View>

        {/* 已选标签（动态渲染） */}
        <View className='selected-tags' aria-live='polite'>
          {Object.keys(selected).length === 0 && (
            <Text className='no-selected'>暂无已选</Text>
          )}
          {Object.entries(selected).map(([sectionId, values]) => {
            // 确保 values 是数组，防止意外错误
            if (!Array.isArray(values)) return null
            return values.map(val => (
              <Text
                key={`${sectionId}-${val}`}
                className='tag'
                onClick={() => handleRemoveTag(sectionId, val)}
                role='button'
                aria-label={`移除 ${getLabel(sectionId, val)}`}
              >
                {getLabel(sectionId, val)} <Text className='close'>×</Text>
              </Text>
            ))
          })}
        </View>

        <ScrollView scrollY className='filter-scroll'>
          {filterSections.map(section => (
            <View key={section.id} className='filter-section'>
              <View
                className='section-header'
                onClick={() => toggleSection(section.id)}
                role='button'
                aria-expanded={!!expandedSections[section.id]}
              >
                <Text className='section-title'>{section.title}</Text>
                <Text className='expand-icon'>{expandedSections[section.id] ? '▲' : '▼'}</Text>
              </View>

              {expandedSections[section.id] && (
                <View className='section-options'>
                  {section.options.map(opt => {
                    const isSelected = (selected[section.id] || []).includes(opt.value)
                    return (
                      <View
                        key={String(opt.value)}
                        className={`option-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleOptionClick(section, opt.value)}
                        role='button'
                        aria-pressed={isSelected}
                      >
                        <Text>{opt.label}</Text>
                      </View>
                    )
                  })}
                </View>
              )}
            </View>
          ))}
        </ScrollView>

        {/* 底部按钮 */}
        <View className='filter-footer'>
          <Button className='clear-btn' onClick={handleClearAll}>清空</Button>
          <Button className='confirm-btn' onClick={handleConfirm}>完成</Button>
        </View>
      </View>
    </View>
  )
}