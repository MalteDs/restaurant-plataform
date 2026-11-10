export const DENOMINATIONS = [
  100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50
] as const

export function denominationTotal(breakdown: Record<string, number>): number {
  return DENOMINATIONS.reduce(
    (sum, denomination) => sum + denomination * Number(breakdown[String(denomination)] ?? 0),
    0
  )
}
