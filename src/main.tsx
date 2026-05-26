import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { App } from './App'
import './styles.css'

// HashRouter 适合 Electron:打包后页面是 file:// 协议,BrowserRouter 的 history API
// 需要服务器配合 fallback,而 HashRouter 用 #/path 不依赖服务端,直接可用。
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
