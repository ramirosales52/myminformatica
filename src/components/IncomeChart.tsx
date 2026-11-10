import { useId } from 'react'
import type { Currency, Payment } from '../lib/types'
import { money, signedAmount, zoned } from '../lib/domain'
import { TrendingUp } from 'lucide-react'

export function IncomeChart({
  payments,
  currency,
  days,
  grouping = 'day',
}: {
  payments: Payment[]
  currency: Currency
  days: string[]
  grouping?: 'day' | 'week' | 'month'
}) {
  const id = useId().replace(/:/g, '')
  const buckets = new Map<string, number>()
  function bucket(date: string) {
    if (grouping === 'month') return date.slice(0, 7)
    if (grouping === 'week') {
      const d = new Date(`${date}T12:00:00Z`)
      const delta = (d.getUTCDay() + 6) % 7
      d.setUTCDate(d.getUTCDate() - delta)
      return d.toISOString().slice(0, 10)
    }
    return date
  }
  days.forEach((d) => buckets.set(bucket(d), 0))
  payments
    .filter((p) => p.currency === currency)
    .forEach((p) => {
      const key = bucket(zoned(p.paid_at, 'yyyy-MM-dd'))
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + signedAmount(p))
    })
  const series = [...buckets].map(([date, amount]) => ({ date, amount }))
  const max = Math.max(...series.map((s) => s.amount), 100)
  const min = Math.min(...series.map((s) => s.amount), 0)
  const points = series.map((s, i) => ({
    x: 12 + (i / Math.max(1, series.length - 1)) * 570,
    y: 145 - ((s.amount - min) / (max - min)) * 120,
    ...s,
  }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
  const hasPayments = payments.some((p) => p.currency === currency)
  return (
    <div className="income-chart">
      <div className="chart-scale">
        <span>{money(max, currency)}</span>
        <span>{money(Math.round((max + min) / 2), currency)}</span>
        <span>{money(min, currency)}</span>
      </div>
      <div className="chart-plot">
        <svg
          viewBox="0 0 600 175"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Ingresos reales en ${currency}: ${series.map((s) => `${s.date} ${money(s.amount, currency)}`).join(', ')}`}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={currency === 'ARS' ? '#6488ff' : '#58d6aa'}
                stopOpacity="0.23"
              />
              <stop
                offset="100%"
                stopColor={currency === 'ARS' ? '#6488ff' : '#58d6aa'}
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          {[25, 85, 145].map((y) => (
            <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#26324a" strokeDasharray="4 5" />
          ))}
          {hasPayments ? (
            <>
              <path d={`${line} L${points.at(-1)?.x ?? 582},165 L12,165 Z`} fill={`url(#${id})`} />
              <path
                d={line}
                fill="none"
                stroke={currency === 'ARS' ? '#7594ff' : '#58d6aa'}
                strokeWidth="2.7"
                vectorEffect="non-scaling-stroke"
              />
              {points.map((p) => (
                <circle
                  key={p.date}
                  cx={p.x}
                  cy={p.y}
                  r="3.5"
                  fill={currency === 'ARS' ? '#7594ff' : '#58d6aa'}
                >
                  <title>
                    {p.date}: {money(p.amount, currency)}
                  </title>
                </circle>
              ))}
            </>
          ) : null}
        </svg>
        {!hasPayments ? (
          <div className="chart-empty">
            <TrendingUp size={20} />
            <span>Tus cobros aparecerán acá</span>
          </div>
        ) : null}
        <div className="chart-labels">
          {series
            .filter(
              (_, i) =>
                series.length <= 7 ||
                i % Math.ceil(series.length / 6) === 0 ||
                i === series.length - 1,
            )
            .map((s) => (
              <span key={s.date}>
                {grouping === 'month' ? s.date : `${s.date.slice(8)}/${s.date.slice(5, 7)}`}
              </span>
            ))}
        </div>
      </div>
    </div>
  )
}
