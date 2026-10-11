import { useRef, useState, type FormEvent } from 'react'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { api, useAsync } from './api'
import { useI18n } from './i18n'
import type { EntryPayload, Meal, Nutrients, NutritionDay, NutritionFood, NutritionTargets } from './nutrition-types'
import './nutrition.css'

const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'] as const
const meals: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack']
const labels = { calories: ['熱量', 'Energy'], protein: ['蛋白質', 'Protein'], carbs: ['碳水化合物', 'Carbs'], fat: ['脂肪', 'Fat'] } as const
const mealLabels = { breakfast: ['早餐', 'Breakfast'], lunch: ['午餐', 'Lunch'], dinner: ['晚餐', 'Dinner'], snack: ['點心', 'Snack'] } as const
const emptyTargets: NutritionTargets = { calories: null, protein: null, carbs: null, fat: null }
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }
function values(form: HTMLFormElement): Nutrients { const data = new FormData(form); return Object.fromEntries(nutrientKeys.map(key => [key, Number(data.get(key))])) as Nutrients }

export default function NutritionPage() {
  const { t } = useI18n()
  const [date, setDate] = useState(localDate)
  const { data, loading, error, retry } = useAsync(() => api.nutrition(date), [date])
  return <div className="page nutrition-page">
    <header className="page-title"><p className="eyebrow">NUTRITION JOURNAL</p><h1>{t('飲食紀錄', 'Nutrition')}</h1><p>{t('訓練之外，記下每天的補給。', 'Keep track of what fuels your training.')}</p></header>
    <div className="nutrition-date"><label htmlFor="nutrition-date">{t('紀錄日期', 'Log date')}</label><input id="nutrition-date" type="date" value={date} required min="0001-01-01" max="9999-12-31" onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDate(e.target.value) }} /><button className="button secondary" onClick={() => setDate(localDate())}>{t('今天', 'Today')}</button></div>
    <p className="nutrition-note">{t('紀錄儲存於目前瀏覽器的裝置識別碼下，尚未支援帳號跨裝置同步。', 'Logs are linked to this browser’s device ID. Account-based cross-device sync is not available yet.')}</p>
    {loading ? <p role="status">{t('正在讀取飲食紀錄…', 'Loading nutrition logs…')}</p> : error ? <div role="alert"><p>{t('無法載入飲食紀錄，請重試。', 'Unable to load nutrition logs. Please retry.')}</p><button className="button secondary" onClick={retry}><RotateCcw size={16} />{t('重新載入', 'Reload')}</button></div> : data && <NutritionJournal key={date} date={date} data={data} refresh={retry} />}
  </div>
}

function NutritionJournal({ date, data, refresh }: { date: string; data: NutritionDay; refresh: () => void }) {
  const { t, locale } = useI18n()
  const [showFood, setShowFood] = useState(false)
  const [showTargets, setShowTargets] = useState(false)
  const [foodId, setFoodId] = useState('')
  const [query, setQuery] = useState('')
  const [grams, setGrams] = useState('100')
  const [meal, setMeal] = useState<Meal>('breakfast')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  const [notice, setNotice] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const pending = useRef<EntryPayload | null>(null)
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)
  const totals = data.entries.reduce((total, entry) => { for (const key of nutrientKeys) total[key] += entry[key]; return total }, { calories: 0, protein: 0, carbs: 0, fat: 0 })
  const food = data.foods.find(item => item.id === foodId)
  const filtered = data.foods.filter(item => item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const selectedFoods = food && !filtered.includes(food) ? [food, ...filtered] : filtered
  const amount = Number(grams)
  async function log(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (!pending.current && (!food || !Number.isFinite(amount) || amount <= 0 || amount > 10000))) return
    pending.current ??= { id: crypto.randomUUID(), foodId, date, meal, grams: amount }
    setBusy(true); setFailure(false); setNotice('')
    try { await api.logFood(pending.current); pending.current = null; setNotice(t('餐點已記錄。', 'Meal logged.')); refresh() } catch { setFailure(true) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (busy) return
    setBusy(true); setFailure(false); setNotice('')
    try { await api.deleteFoodEntry(id); setDeleting(null); refresh() } catch { setNotice(t('刪除未確認成功，請重試。', 'Deletion could not be confirmed. Please retry.')) } finally { setBusy(false) }
  }
  return <>
    <section className="nutrition-totals" aria-label={t('每日營養總量', 'Daily nutrient totals')}>{nutrientKeys.map(key => <article key={key}><span>{t(labels[key][0], labels[key][1])}</span><strong>{format(totals[key])}<small>{key === 'calories' ? 'kcal' : 'g'}</small></strong><p>{data.targets[key] == null ? t('未設定目標', 'No target set') : `${t('目標', 'Target')} ${format(data.targets[key]!)} ${key === 'calories' ? 'kcal' : 'g'}`}</p>{data.targets[key] != null && <progress aria-label={t(labels[key][0], labels[key][1])} value={Math.min(totals[key], data.targets[key]!)} max={data.targets[key]!} />}</article>)}</section>
    <div className="nutrition-actions"><button className="button secondary" aria-expanded={showTargets} onClick={() => setShowTargets(!showTargets)}>{t('設定每日目標', 'Daily targets')}</button><button className="button secondary" aria-expanded={showFood} onClick={() => setShowFood(!showFood)}><Plus size={16} />{t('新增自訂食物', 'Create food')}</button></div>
    {showTargets && <TargetsForm targets={data.targets} onSaved={() => { setShowTargets(false); refresh() }} />}
    {showFood && <FoodForm onSaved={() => { setShowFood(false); refresh() }} />}
    <section className="nutrition-section"><h2>{t('記錄一餐', 'Log a meal')}</h2>{data.foods.length === 0 ? <div className="nutrition-empty"><p>{t('先依食品包裝上的營養標示新增食物，再記錄實際吃下的克數。', 'Create a food from its nutrition label, then log the amount you ate in grams.')}</p><button className="button" onClick={() => setShowFood(true)}>{t('新增第一筆食物', 'Create your first food')}</button></div> : <form onSubmit={log} className="nutrition-log-form"><fieldset disabled={busy || Boolean(pending.current)}><label>{t('搜尋你的食物', 'Search your foods')}<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('輸入食物名稱', 'Food name')} /></label><label>{t('食物', 'Food')}<select aria-label={t('食物', 'Food')} required value={foodId} onChange={e => setFoodId(e.target.value)}><option value="">{t('選擇食物', 'Select a food')}</option>{selectedFoods.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('餐別', 'Meal')}<select aria-label={t('餐別', 'Meal')} value={meal} onChange={e => setMeal(e.target.value as Meal)}>{meals.map(item => <option key={item} value={item}>{t(mealLabels[item][0], mealLabels[item][1])}</option>)}</select></label><label>{t('份量（克）', 'Amount (g)')}<input type="number" required min="0.1" max="10000" step="0.1" value={grams} onChange={e => setGrams(e.target.value)} /></label></fieldset>{food && Number.isFinite(amount) && amount > 0 && <p className="nutrition-preview">{nutrientKeys.map(key => `${t(labels[key][0], labels[key][1])} ${format(food[key] * amount / 100)} ${key === 'calories' ? 'kcal' : 'g'}`).join(' · ')}</p>}{failure && <p className="nutrition-error" role="alert">{t('尚未確認儲存成功。重試會沿用同一筆紀錄，不會重複新增。', 'Save not confirmed. Retry sends the same entry without creating a duplicate.')}</p>}<button className="button signal" disabled={busy || (!food && !pending.current)}>{busy ? t('儲存中…', 'Saving…') : pending.current ? t('重試儲存', 'Retry save') : t('加入飲食紀錄', 'Log meal')}</button></form>}</section>
    {notice && <p role="status">{notice}</p>}
    <section className="nutrition-section"><h2>{t('當日餐點', 'Meals for the day')}</h2>{data.entries.length === 0 && <p className="nutrition-empty">{t('這一天還沒有飲食紀錄。', 'No meals logged for this date.')}</p>}{meals.map(item => { const entries = data.entries.filter(entry => entry.meal === item); return entries.length > 0 && <section key={item} className="meal-ledger"><h3>{t(mealLabels[item][0], mealLabels[item][1])}</h3>{entries.map(entry => <article key={entry.id}><div><strong>{entry.name}</strong><p>{format(entry.grams)} g · {format(entry.calories)} kcal</p><small>{t('蛋白質', 'Protein')} {format(entry.protein)} g · {t('碳水', 'Carbs')} {format(entry.carbs)} g · {t('脂肪', 'Fat')} {format(entry.fat)} g</small></div>{deleting === entry.id ? <div className="delete-confirm"><span>{t('刪除此筆？', 'Delete entry?')}</span><button className="button secondary" disabled={busy} onClick={() => remove(entry.id)}>{t('確認刪除', 'Delete')}</button><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>{t('取消', 'Cancel')}</button></div> : <button className="nutrition-delete" disabled={busy} onClick={() => setDeleting(entry.id)} aria-label={`${t('刪除', 'Delete')} ${entry.name}`}><Trash2 size={18} /></button>}</article>)}</section> })}</section>
    <p className="nutrition-note">{t('食物營養數值由你輸入，以每 100 克計算；不會自動套用建議攝取量。', 'Nutrition values are entered by you per 100 g. Intake targets are not assigned automatically.')}</p>
  </>
}

function FoodForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef<NutritionFood | null>(null)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    pending.current ??= { id: crypto.randomUUID(), name: String(new FormData(event.currentTarget).get('name')).trim(), ...values(event.currentTarget) }
    setBusy(true); setError(false)
    try { await api.createFood(pending.current); pending.current = null; onSaved() } catch { setError(true) } finally { setBusy(false) }
  }
  return <form className="nutrition-editor" onSubmit={save}><h2>{t('新增自訂食物', 'Create a food')}</h2><p>{t('請填每 100 克的數值，不是每份。若每份 50 克，請先將包裝標示乘以 2。', 'Enter values per 100 g, not per serving. For a 50 g serving, multiply the label values by 2.')}</p><fieldset disabled={busy || Boolean(pending.current)}><label className="full-field">{t('食物名稱', 'Food name')}<input name="name" required maxLength={120} pattern=".*\S.*" /></label>{nutrientKeys.map(key => <label key={key}>{t(labels[key][0], labels[key][1])} ({key === 'calories' ? 'kcal' : 'g'})<input name={key} type="number" required min="0" max={key === 'calories' ? 1000 : 100} step="0.1" /></label>)}</fieldset>{error && <p className="nutrition-error" role="alert">{t('儲存未確認成功，請重試。', 'Save not confirmed. Please retry.')}</p>}<button className="button" disabled={busy}>{busy ? t('儲存中…', 'Saving…') : pending.current ? t('重試儲存', 'Retry save') : t('儲存食物', 'Save food')}</button></form>
}

function TargetsForm({ targets, onSaved }: { targets: NutritionTargets; onSaved: () => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return
    const data = new FormData(event.currentTarget)
    const payload = { ...emptyTargets }
    for (const key of nutrientKeys) payload[key] = String(data.get(key)).trim() === '' ? null : Number(data.get(key))
    setBusy(true); setError(false)
    try { await api.setNutritionTargets(payload); onSaved() } catch { setError(true) } finally { setBusy(false) }
  }
  return <form className="nutrition-editor" onSubmit={save}><h2>{t('每日營養目標', 'Daily nutrition targets')}</h2><p>{t('自行設定每日目標，留空則不追蹤該項。設定適用於所有日期。', 'Set your own daily targets. Leave a field blank to turn it off. Targets apply to all dates.')}</p><fieldset disabled={busy}>{nutrientKeys.map(key => <label key={key}>{t(labels[key][0], labels[key][1])} ({key === 'calories' ? 'kcal' : 'g'})<input name={key} type="number" min="0.1" max={key === 'calories' ? 20000 : 2000} step="0.1" defaultValue={targets[key] ?? ''} /></label>)}</fieldset>{error && <p className="nutrition-error" role="alert">{t('目標儲存失敗，請重試。', 'Could not save targets. Please retry.')}</p>}<button className="button" disabled={busy}>{busy ? t('儲存中…', 'Saving…') : t('儲存目標', 'Save targets')}</button></form>
}
