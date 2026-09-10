import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Thai-first type system: Kanit for display/brand, Sarabun for body & data
import '@fontsource/kanit/500.css'
import '@fontsource/kanit/600.css'
import '@fontsource/kanit/700.css'
import '@fontsource/sarabun/400.css'
import '@fontsource/sarabun/500.css'
import '@fontsource/sarabun/600.css'
import '@fontsource/sarabun/700.css'

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
