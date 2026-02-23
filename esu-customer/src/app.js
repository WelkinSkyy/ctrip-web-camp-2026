
import { useLaunch } from '@tarojs/taro'
import './app.scss'

// 如果使用 React 17+ 且 Taro 配置了自动引入，可以省略下面这行；
// 否则建议加上 React 导入
import React from 'react'

function App({ children }) {
  useLaunch(() => {
    console.log('App launched.')
  })

  // 用 Fragment 包裹 children，这是最轻量的方式
  return (
    <>
      {children}
    </>
  )
}

export default App