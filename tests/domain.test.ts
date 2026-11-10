import { describe, expect, it } from 'vitest'
import {
  csvValue,
  customerSchedule,
  fillTemplate,
  inRange,
  money,
  normalizePhone,
  normalizeOptionalPhone,
  paidFor,
  paymentState,
  shifted,
  signedAmount,
  toCents,
  toOffsetMinutes,
  totals,
  toUTC,
  utcOffsetLabel,
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
  it('admite teléfono opcional sin omitir la validación de números ingresados', () => {
    expect(normalizeOptionalPhone('')).toBe('')
    expect(normalizeOptionalPhone('   ')).toBe('')
    expect(normalizeOptionalPhone('9 351 1234567', '+54')).toBe('+5493511234567')
    expect(normalizeOptionalPhone('+54 9 351 123 4567', '')).toBe('+5493511234567')
    expect(normalizeOptionalPhone('5493511234567', '')).toBe('+5493511234567')
    expect(normalizeOptionalPhone('+1 (202) 555-0123', '')).toBe('+12025550123')
    expect(normalizeOptionalPhone('', '')).toBe('')
    expect(() => normalizeOptionalPhone('123')).toThrow()
    expect(() => normalizeOptionalPhone('abc')).toThrow()
    expect(() => whatsappUrl('', 'Hola')).toThrow()
  })
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
describe('Hora del país del cliente en comprobantes', () => {
  // 20:00 UTC = 17:00 en Argentina. Con la diferencia manual de Colombia (−2 h) son las 15:00.
  const instant = '2026-11-09T20:00:00Z'
  it('carga la diferencia horaria a mano, con coma o punto, y vacío significa Argentina', () => {
    expect(toOffsetMinutes('-2')).toBe(-120)
    expect(toOffsetMinutes('+4')).toBe(240)
    expect(toOffsetMinutes('4,5')).toBe(270)
    expect(toOffsetMinutes('')).toBeNull()
    expect(toOffsetMinutes('0')).toBeNull()
    expect(() => toOffsetMinutes('mañana')).toThrow()
    expect(() => toOffsetMinutes('20')).toThrow()
  })
  it('corrige el instante por la diferencia del cliente, no por el código telefónico', () => {
    expect(zoned(shifted(instant, -120), 'HH:mm')).toBe('15:00')
    expect(zoned(shifted(instant, 240), 'HH:mm')).toBe('21:00')
    expect(zoned(shifted(instant, null), 'HH:mm')).toBe('17:00')
    // Un turno de madrugada cambia de día para el cliente.
    expect(zoned(shifted(instant, 600), 'dd/MM/yyyy HH:mm')).toBe('10/11/2026 03:00')
  })
  it('etiqueta la hora del cliente a partir de la diferencia', () => {
    expect(utcOffsetLabel(-120)).toBe('UTC\u22125')
    expect(utcOffsetLabel(240)).toBe('UTC+1')
    expect(utcOffsetLabel(510)).toBe('UTC+5:30')
    expect(utcOffsetLabel(180)).toBe('UTC')
    expect(utcOffsetLabel(null)).toBe('UTC\u22123')
  })
  it('arma el horario del mensaje con la hora del cliente y la de Argentina', () => {
    expect(customerSchedule(instant, -120)).toBe(
      '09/11/2026 a las 15:00 (hora de tu país) · Argentina: 09/11/2026 a las 17:00',
    )
    expect(customerSchedule(instant, null)).toBe('09/11/2026 a las 17:00 (Argentina)')
  })
})
