import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { I18nProvider } from './i18n'
import styles from './styles.css?raw'
import authStyles from './auth.css?raw'

createRoot(document.getElementById('root')!).render(<StrictMode><style>{styles + authStyles}</style><I18nProvider><BrowserRouter><App /></BrowserRouter></I18nProvider></StrictMode>)
