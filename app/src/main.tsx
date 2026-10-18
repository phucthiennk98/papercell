import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'katex/dist/katex.min.css'
import './index.css'
import './figure/papercell.css'
import './figure/figure.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
