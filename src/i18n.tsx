import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LOCALE_STORAGE_KEY, normalizeLocale, translateContent, type Locale } from './translations'
export type { Locale } from './translations'

type I18n = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (zh: string, en: string) => string
  localize: (text: string) => string
}
const I18nContext = createContext<I18n | null>(null)
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    try { return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY)) } catch { return 'zh-TW' }
  })
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = locale === 'en' ? 'FitFlow | Training & Nutrition' : 'FitFlow｜週期訓練與營養'
    try { localStorage.setItem(LOCALE_STORAGE_KEY, locale) } catch { /* Switching remains usable without storage. */ }
  }, [locale])
  const value = useMemo<I18n>(() => ({ locale, setLocale, t: (zh, en) => locale === 'en' ? en : zh, localize: (text) => translateContent(text, locale) }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n requires I18nProvider')
  return context
}
