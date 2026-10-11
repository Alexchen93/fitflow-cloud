export type Nutrients = { calories: number; protein: number; carbs: number; fat: number }
export type NutritionFood = Nutrients & { id: string; name: string }
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type NutritionEntry = Nutrients & { id: string; foodId: string; name: string; meal: Meal; grams: number }
export type NutritionTargets = { [K in keyof Nutrients]: number | null }
export type NutritionDay = { foods: NutritionFood[]; entries: NutritionEntry[]; targets: NutritionTargets }
export type EntryPayload = { id: string; foodId: string; date: string; meal: Meal; grams: number }
