import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import styles from './styles.css?raw'

createRoot(document.getElementById('root')!).render(<StrictMode><style>{styles}</style><BrowserRouter><App /></BrowserRouter></StrictMode>)
