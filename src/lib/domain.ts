import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { es } from 'date-fns/locale'
import {
  addDays,
  addMinutes,
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import type { Appointment, AppointmentService, Currency, Payment } from './types'

export const TIMEZONE = 'America/Argentina/Cordoba'
export const zoned = (date: string | Date, pattern = 'dd MMM yyyy') =>
  formatInTimeZone(date, TIMEZONE, pattern, { locale: es })
export const today = () => zoned(new Date(), 'yyyy-MM-dd')
export const localInput = (date: string | Date) => zoned(date, "yyyy-MM-dd'T'HH:mm")
export const toUTC = (dateTime: string) => fromZonedTime(dateTime, TIMEZONE).toISOString()

// Diferencia horaria manual del cliente respecto de Argentina, en minutos.
// El código telefónico no indica dónde está la persona, así que se carga a mano por cliente.
// Argentina no cambia de horario de verano, corregir el instante y formatearlo acá da la
// hora de pared exacta que el cliente ve en su país. Sin null o 0 no hay corrección.
export function toOffsetMinutes(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) return null
  if (!/^[+-]?\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error('Ingresá la diferencia en horas respecto de Argentina, por ejemplo -2 o 4,5.')
  const minutes = Math.round(Number(normalized) * 60)
  if (minutes === 0) return null
  if (Math.abs(minutes) > 17 * 60)
    throw new Error('La diferencia horaria admite hasta ±17 horas respecto de Argentina.')
  return minutes
}
export const shifted = (date: string | Date, minutes?: number | null) =>
  minutes ? addMinutes(new Date(date), minutes) : new Date(date)
export const utcOffsetLabel = (minutes?: number | null) => {
  const total = -180 + (minutes ?? 0)
  if (total === 0) return 'UTC'
  const sign = total < 0 ? '\u2212' : '+'
  const abs = Math.abs(total)
  const hours = Math.floor(abs / 60)
  return `UTC${sign}${hours}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`
}
export function customerSchedule(date: string, minutes?: number | null) {
  const yours = zoned(shifted(date, minutes), "dd/MM/yyyy 'a las' HH:mm")
  return minutes
    ? `${yours} (hora de tu país) · Argentina: ${zoned(date, "dd/MM/yyyy 'a las' HH:mm")}`
    : `${yours} (Argentina)`
}
export const dateObject = (day: string) => new Date(`${day}T12:00:00`)
export const shiftDay = (day: string, n: number) =>
  format(addDays(dateObject(day), n), 'yyyy-MM-dd')
export const shiftMonth = (day: string, n: number) =>
  format(addMonths(dateObject(day), n), 'yyyy-MM-dd')
export const weekDays = (day: string) =>
  Array.from({ length: 7 }, (_, n) =>
    format(addDays(startOfWeek(dateObject(day), { weekStartsOn: 1 }), n), 'yyyy-MM-dd'),
  )
export const monthDays = (day: string) => {
  const start = startOfWeek(startOfMonth(dateObject(day)), { weekStartsOn: 1 })
  return Array.from({ length: 42 }, (_, n) => format(addDays(start, n), 'yyyy-MM-dd'))
}
export function money(cents: number, currency: Currency = 'ARS') {
  return `${currency} ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: currency === 'USD' || cents % 100 !== 0 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100)}`
}
export function toCents(value: string | number) {
  const normalized = String(value).trim().replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error('Ingresá un importe positivo, con hasta dos decimales.')
  const cents = Math.round(Number(normalized) * 100)
  if (!Number.isSafeInteger(cents) || cents > 100000000000)
    throw new Error('El importe supera el máximo permitido.')
  return cents
}
export const signedAmount = (p: Payment) =>
  p.amount_cents * (p.kind === 'refund' || p.kind === 'correction_refund' ? -1 : 1)
export const paidFor = (id: string, payments: Payment[]) =>
  payments.filter((p) => p.appointment_id === id).reduce((s, p) => s + signedAmount(p), 0)
export const paymentState = (total: number, paid: number) =>
  paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid'
export const PAYMENT_STATUS = { paid: 'Pagado', partial: 'Pago parcial', unpaid: 'No pagado' }
export const duration = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
export const endTime = (a: Pick<Appointment, 'starts_at' | 'duration_minutes'>) =>
  new Date(new Date(a.starts_at).getTime() + a.duration_minutes * 60000)
export const serviceNames = (id: string, lines: AppointmentService[]) =>
  lines
    .filter((l) => l.appointment_id === id)
    .map((l) => l.name)
    .join(' + ')
export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'T'
export function normalizePhone(phone: string, countryCode = '+54') {
  const digits = phone.replace(/\D/g, '')
  const code = countryCode.replace(/\D/g, '')
  const normalized = `+${phone.trim().startsWith('+') ? digits : code + digits}`
  if (!/^\+[1-9]\d{6,14}$/.test(normalized))
    throw new Error('Ingresá un WhatsApp válido con código de país (7 a 15 dígitos).')
  return normalized
}
export function normalizeOptionalPhone(phone: string, countryCode = '+54') {
  return phone.trim() ? normalizePhone(phone, countryCode) : ''
}
export function whatsappUrl(phone: string, text: string) {
  const normalized = normalizePhone(phone)
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(text)}`
}
export function fillTemplate(body: string, values: Record<string, string>) {
  return body.replace(
    /\{(nombre_cliente|servicio|precio|moneda|fecha|hora)\}/g,
    (match, name: string) => values[name] ?? match,
  )
}
export function csvValue(value: unknown) {
  let text = String(value ?? '')
  if (/^\s*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
export function downloadFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
export function exportCsv(rows: unknown[][], name: string) {
  downloadFile(
    new Blob(['\uFEFF' + rows.map((r) => r.map(csvValue).join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
    name,
  )
}
export type Period = 'today' | 'yesterday' | 'week' | 'month' | 'previous' | 'custom'
export function periodRange(
  period: Period,
  customFrom = today(),
  customTo = today(),
): [string, string] {
  const day = today()
  if (period === 'today') return [day, day]
  if (period === 'yesterday') return [shiftDay(day, -1), shiftDay(day, -1)]
  if (period === 'week') {
    const days = weekDays(day)
    return [days[0], days[6]]
  }
  const d = period === 'previous' ? addMonths(dateObject(day), -1) : dateObject(day)
  if (period === 'month' || period === 'previous')
    return [format(startOfMonth(d), 'yyyy-MM-dd'), format(endOfMonth(d), 'yyyy-MM-dd')]
  return [customFrom, customTo]
}
export const inRange = (date: string, from: string, to: string) => {
  const d = zoned(date, 'yyyy-MM-dd')
  return d >= from && d <= to
}
export function totals(appointments: Appointment[], payments: Payment[]) {
  return (['ARS', 'USD'] as Currency[]).map((currency) => ({
    currency,
    collected: payments
      .filter((p) => p.currency === currency)
      .reduce((s, p) => s + signedAmount(p), 0),
    agreed: appointments
      .filter((a) => a.currency === currency && !a.deleted_at)
      .reduce((s, a) => s + a.total_cents, 0),
    pending: appointments
      .filter((a) => a.currency === currency && !a.deleted_at && a.status !== 'cancelled')
      .reduce((s, a) => s + Math.max(0, a.total_cents - paidFor(a.id, payments)), 0),
  }))
}
