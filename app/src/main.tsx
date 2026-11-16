import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applySettings, loadSettings } from './core/settings'
import { themeCss } from './core/themes'
import './ui/chat/chat.css'
import './ui/app.css'

// 情绪色彩的 CSS 变量(单一来源:core/themes.ts)
const style = document.createElement('style')
style.id = 'theme-vars'
style.textContent = themeCss()
document.head.appendChild(style)
applySettings(loadSettings())

if (import.meta.env.DEV) {
  void import('./devtools').then((m) => m.installDevTools())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
