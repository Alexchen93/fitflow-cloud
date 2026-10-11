import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { englishContent, normalizeLocale, translateContent } from '../src/translations'

const hasChinese = /[\u3400-\u9fff]/
describe('FitFlow localization', () => {
  it('covers every Chinese seed label, instruction, caution and muscle in the original training catalog', () => {
    const seed = readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8')
    const labels = [...seed.matchAll(/'((?:''|[^'])*)'/g)]
      .map((match) => match[1].replaceAll("''", "'"))
      .filter((value) => hasChinese.test(value))
      .flatMap((value): string[] => value.startsWith('[') ? JSON.parse(value) as string[] : [value])
    expect(labels.length).toBeGreaterThan(100)
    const missing = labels.filter((label) => !englishContent[label] || hasChinese.test(translateContent(label, 'en')))
    expect([...new Set(missing)]).toEqual([])
    for (const label of labels) expect(translateContent(label, 'zh-TW')).toBe(label)
  })

  it('covers static UI labels used by the training screens', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    const labels = [...app.matchAll(/localize\(("(?:[^"\\]|\\.)*")\)/g)].map((match) => JSON.parse(match[1]) as string)
    expect(labels.length).toBeGreaterThan(30)
    expect(labels.filter((label) => !englishContent[label])).toEqual([])
  })

  it('defaults safely to Traditional Chinese and preserves unknown content and identifiers', () => {
    expect(normalizeLocale(null)).toBe('zh-TW')
    expect(normalizeLocale('invalid')).toBe('zh-TW')
    expect(normalizeLocale('en')).toBe('en')
    expect(translateContent('w1d1-1', 'en')).toBe('w1d1-1')
    expect(translateContent('我的私人訓練筆記', 'en')).toBe('我的私人訓練筆記')
    expect(translateContent('深蹲新版本', 'en')).toBe('深蹲新版本')
  })
})
