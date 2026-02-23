import { View, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useMemo } from 'react'
import './CalendarModal.scss'

// 工具函数
const getMonthDays = (year, month) => new Date(year, month + 1, 0).getDate()

const generateMonthCalendar = (year, month, selected, marks, todayStr) => {
  // ... 函数体保持不变
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = getMonthDays(year, month)

  const weeks = []
  let dayCount = 1
  for (let row = 0; row < 6; row++) {
    const week = []
    for (let col = 0; col < 7; col++) {
      if (row === 0 && col < firstDay) {
        week.push({ day: null, fullDate: null, isCurrent: false, marks: [], disabled: true })
      } else if (dayCount <= daysInMonth) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayCount).padStart(2, '0')}`
        week.push({
          day: dayCount,
          fullDate: dateStr,
          isCurrent: true,
          marks: marks[dateStr] ? [marks[dateStr]] : [],
          disabled: dateStr < todayStr,
        })
        dayCount++
      } else {
        week.push({ day: null, fullDate: null, isCurrent: false, marks: [], disabled: true })
      }
    }
    weeks.push(week)
  }
  return weeks
}

const generateMonthsData = (startYear, startMonth, monthsCount, selected, marks, todayStr) => {
  const months = []
  for (let i = 0; i < monthsCount; i++) {
    const year = startYear + Math.floor((startMonth + i) / 12)
    const month = (startMonth + i) % 12
    const weeks = generateMonthCalendar(year, month, selected, marks, todayStr)
    months.push({ year, month, weeks })
  }
  return months
}

export default function CalendarModal({ visible, onClose, onConfirm, checkIn, checkOut }) {
  const [selected, setSelected] = useState({ in: checkIn || '', out: checkOut || '' })
  const [startYear, setStartYear] = useState(() => {
    const d = checkIn ? new Date(checkIn) : new Date()
    return d.getFullYear()
  })
  const [startMonth, setStartMonth] = useState(() => {
    const d = checkIn ? new Date(checkIn) : new Date()
    return d.getMonth()
  })

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const marks = {
    '2026-02-12': '今天',
    '2026-02-13': '班',
    '2026-02-14': '情人节',
    '2026-02-15': '休',
    '2026-02-16': '除夕',
    '2026-02-17': '春节',
    '2026-02-18': '休',
    '2026-02-19': '休',
    '2026-02-20': '休',
    '2026-02-21': '休',
    '2026-02-22': '休',
    '2026-02-23': '休',
    '2026-02-24': '班',
    '2026-02-28': '班',
    '2026-03-02': '元宵',
    '2026-03-08': '妇女节',
    '2026-04-04': '休',
    '2026-04-05': '清明',
    '2026-04-06': '休',
    '2026-05-01': '劳动节',
    '2026-05-02': '休',
    '2026-05-03': '休',
    '2026-05-04': '青年节',
    '2026-05-05': '休',
    '2026-05-09': '班',
    '2026-05-10': '母亲节',
    [todayStr]: '今天',
  }

  useEffect(() => {
    if (visible) {
      setSelected({ in: checkIn || '', out: checkOut || '' })
      const d = checkIn ? new Date(checkIn) : new Date()
      setStartYear(d.getFullYear())
      setStartMonth(d.getMonth())
    }
  }, [visible, checkIn, checkOut])

  const monthsData = useMemo(
    () => generateMonthsData(startYear, startMonth, 3, selected, marks, todayStr),
    [startYear, startMonth, selected, marks, todayStr]
  )

  const handleDateClick = (dateStr, disabled) => {
    if (disabled || !dateStr) return

    setSelected(prev => {
      const { in: tempIn, out: tempOut } = prev
      if (!tempIn) return { in: dateStr, out: '' }
      if (tempIn && !tempOut) {
        if (dateStr > tempIn) return { in: tempIn, out: dateStr }
        if (dateStr < tempIn) return { in: dateStr, out: '' }
        return prev
      }
      return { in: dateStr, out: '' }
    })
  }

  const handlePrevMonth = () => {
    if (startMonth === 0) {
      setStartYear(startYear - 1)
      setStartMonth(11)
    } else {
      setStartMonth(startMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (startMonth === 11) {
      setStartYear(startYear + 1)
      setStartMonth(0)
    } else {
      setStartMonth(startMonth + 1)
    }
  }

  const handleConfirm = () => {
    if (selected.in && selected.out) {
      onConfirm(selected.in, selected.out)
      onClose()
    } else {
      Taro.showToast({ title: '请选择完整的入住和离店日期', icon: 'none' })
    }
  }

  if (!visible) return null

  return (
    <View
      className={`calendar-modal-mask ${visible ? 'active' : ''}`}
      onClick={onClose}
    >
      <View className='calendar-modal-content' onClick={e => e.stopPropagation()}>
        {/* 头部统一使用 modal-header */}
        <View className='modal-header'>
          <Text className='cancel' onClick={onClose}>取消</Text>
          <Text className='title'>选择日期</Text>
          <Text className='confirm' onClick={handleConfirm}>完成</Text>
        </View>

        <View className='calendar-nav'>
          <Text className='nav-arrow' onClick={handlePrevMonth}>〈</Text>
          <Text className='month-year'>{startYear}年{startMonth + 1}月</Text>
          <Text className='nav-arrow' onClick={handleNextMonth}>〉</Text>
        </View>

        <ScrollView scrollY className='calendar-scroll'>
          {monthsData.map(({ year, month, weeks }) => (
            <View key={`${year}-${month}-${selected.in}-${selected.out}`} className='month-block'>
              <View className='month-title'>{year}年{month + 1}月</View>
              <View className='weekdays'>
                {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                  <Text key={d} className='weekday'>{d}</Text>
                ))}
              </View>
              {weeks.map((week, rowIndex) => (
                <View key={rowIndex} className='week-row'>
                  {week.map((cell, colIndex) => {
                    const key = cell.fullDate || `empty-${rowIndex}-${colIndex}`
                    const isIn = cell.fullDate === selected.in
                    const isOut = cell.fullDate === selected.out
                    return (
                      <View
                        key={key}
                        className={`day-cell 
                          ${!cell.isCurrent ? 'other-month' : ''}
                          ${isIn ? 'check-in' : ''}
                          ${isOut ? 'check-out' : ''}
                          ${cell.disabled ? 'disabled' : ''}
                          ${!cell.fullDate ? 'empty' : ''}`}
                        onClick={() => handleDateClick(cell.fullDate, cell.disabled)}
                      >
                        {cell.day && <Text className='day-number'>{cell.day}</Text>}
                        {cell.marks.length > 0 && (
                          <View className='day-marks'>
                            {cell.marks.map((mark, idx) => (
                              <Text key={idx} className='day-mark'>{mark}</Text>
                            ))}
                          </View>
                        )}
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>

        <View className='calendar-footer'>
          <Text>已选：{selected.in || '未选'} 至 {selected.out || '未选'}</Text>
        </View>
      </View>
    </View>
  )
}