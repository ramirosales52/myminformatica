import { describe, expect, it } from 'vitest'
import {
  csvValue,
  fillTemplate,
  inRange,
  money,
  normalizePhone,
  paidFor,
  paymentState,
  signedAmount,
  toCents,
  totals,
  toUTC,
  whatsappUrl,
  zoned,
} from '../src/lib/domain'
import type { Appointment, Payment } from '../src/lib/types'

const a = {
  id: 'a',
  total_cents: 2000,
  currency: 'USD',
  status: 'completed',
  deleted_at: null,
} as Appointment
const payment = (
  amount: number,
  kind: Payment['kind'] = 'charge',
  currency: Payment['currency'] = 'USD',
): Payment =>
  ({
    id: crypto.randomUUID(),
    appointment_id: currency === 'USD' ? 'a' : 'ars',
    amount_cents: amount,
    kind,
    currency,
    paid_at: '2026-11-09T16:00:00Z',
  }) as Payment
describe('Reglas económicas', () => {
  it('convierte decimales a centavos sin truncar', () => {
    expect(toCents('20.10')).toBe(2010)
    expect(toCents('0,29')).toBe(29)
    expect(() => toCents('-10')).toThrow()
    expect(() => toCents('1.001')).toThrow()
    expect(() => toCents('NaN')).toThrow()
  })
  it('USD 20: no pagado, parcial y completamente pagado', () => {
    expect(paymentState(2000, 0)).toBe('unpaid')
    expect(paymentState(2000, 1000)).toBe('partial')
    expect(paymentState(2000, 2000)).toBe('paid')
  })
  it('dos mitades no duplican el precio del trabajo', () => {
    const p = [payment(1000), payment(1000)]
    expect(paidFor('a', p)).toBe(2000)
    expect(totals([a], p)[1]).toMatchObject({ collected: 2000, pending: 0 })
  })
  it('completar sin cobrar no genera ingresos', () => {
    expect(totals([a], [])[1]).toMatchObject({ collected: 0, pending: 2000 })
  })
  it('mantiene ARS y USD en balances independientes', () => {
    const result = totals([a], [payment(1000), payment(2500000, 'charge', 'ARS')])
    expect(result[0].collected).toBe(2500000)
    expect(result[1].collected).toBe(1000)
    expect(result[1].pending).toBe(1000)
  })
  it('una devolución resta ingresos sin borrar el cobro', () => {
    const ps = [payment(2000), payment(1000, 'refund')]
    expect(ps).toHaveLength(2)
    expect(signedAmount(ps[1])).toBe(-1000)
    expect(totals([a], ps)[1].collected).toBe(1000)
  })
  it('cancelar no devuelve dinero automáticamente', () => {
    expect(totals([{ ...a, status: 'cancelled' }], [payment(1000)])[1]).toMatchObject({
      collected: 1000,
      pending: 0,
    })
  })
  it('eliminar no altera los movimientos reales', () => {
    expect(totals([{ ...a, deleted_at: '2026-11-09' }], [payment(1000)])[1]).toMatchObject({
      collected: 1000,
      pending: 0,
    })
  })
  it('formatea sin convertir monedas', () => {
    expect(money(2000, 'USD')).toBe('USD 20,00')
    expect(money(2500000, 'ARS')).toBe('ARS 25.000')
  })
})
describe('Argentina, WhatsApp y exportación segura', () => {
  it('interpreta las 14:30 en Córdoba como 17:30 UTC', () => {
    expect(toUTC('2026-11-09T14:30')).toBe('2026-11-09T17:30:00.000Z')
    expect(zoned('2026-11-10T02:30:00Z', 'yyyy-MM-dd HH:mm')).toBe('2026-11-09 23:30')
  })
  it('filtra por fecha argentina, no por la del sistema', () => {
    expect(inRange('2026-11-10T02:30:00Z', '2026-11-09', '2026-11-09')).toBe(true)
    expect(inRange('2026-11-10T04:30:00Z', '2026-11-09', '2026-11-09')).toBe(false)
  })
  it('normaliza teléfonos y bloquea números inválidos', () => {
    expect(normalizePhone('9 351 1234567', '+54')).toBe('+5493511234567')
    expect(normalizePhone('+1 (202) 555-0123', '+54')).toBe('+12025550123')
    expect(() => normalizePhone('123')).toThrow()
  })
  it('abre la conversación correcta con texto codificado', () => {
    const url = new URL(whatsappUrl('+5493511234567', '¡Hola!\nPago: USD 10 💻'))
    expect(url.pathname).toBe('/5493511234567')
    expect(url.searchParams.get('text')).toBe('¡Hola!\nPago: USD 10 💻')
  })
  it('preserva emojis, formato y saltos de línea al reemplazar variables', () => {
    expect(
      fillTemplate('*Hola {nombre_cliente}* 👋\n{servicio}: {precio} {moneda}', {
        nombre_cliente: 'Ana',
        servicio: 'Office',
        precio: '20',
        moneda: 'USD',
      }),
    ).toBe('*Hola Ana* 👋\nOffice: 20 USD')
  })
  it('neutraliza fórmulas en CSV y escapa comillas', () => {
    expect(csvValue('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(csvValue('texto;\n"')).toBe('"texto;\n"""')
  })
})
