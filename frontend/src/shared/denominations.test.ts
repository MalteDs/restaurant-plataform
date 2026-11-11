import { expect, it } from 'vitest'
import { denominationTotal } from './denominations'

it('suma el desglose de billetes y monedas', () => {
  expect(denominationTotal({ '20000': 2, '1000': 3 })).toBe(43000)
})
