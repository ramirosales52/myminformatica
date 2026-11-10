import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck2,
  Download,
  FileBarChart2,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import {
  exportCsv,
  inRange,
  money,
  paidFor,
  periodRange,
  serviceNames,
  shiftDay,
  signedAmount,
  today,
  zoned,
} from '../lib/domain'
import type { Period } from '../lib/domain'
import { KINDS, METHODS } from '../lib/types'
import { IncomeChart } from '../components/IncomeChart'
import { Button, Empty, PageHeading, SectionHeading } from '../components/ui'

const PERIODS: [Period, string][] = [
  ['today', 'Hoy'],
  ['yesterday', 'Ayer'],
  ['week', 'Esta semana'],
  ['month', 'Este mes'],
  ['previous', 'Mes anterior'],
  ['custom', 'Personalizado'],
]
export function Reports({ onSelect }: { onSelect: (id: string) => void }) {
  const { data } = useData()
  const [period, setPeriod] = useState<Period>('month')
  const [fromInput, setFromInput] = useState(today())
  const [toInput, setToInput] = useState(today())
  const [service, setService] = useState('all')
  const [grouping, setGrouping] = useState<'day' | 'week' | 'month'>('day')
  const [from, to] = periodRange(period, fromInput, toInput)
  const invalid =
    !from || !to || from > to || Number(new Date(to)) - Number(new Date(from)) > 3660 * 86400000
  const matchesService = (id: string) =>
    service === 'all' ||
    data.appointmentServices.some((s) => s.appointment_id === id && s.service_id === service)
  const appointments = data.appointments.filter(
    (a) => !invalid && inRange(a.starts_at, from, to) && !a.deleted_at && matchesService(a.id),
  )
  const payments = data.payments
    .filter((p) => !invalid && inRange(p.paid_at, from, to) && matchesService(p.appointment_id))
    .toSorted((a, b) => b.paid_at.localeCompare(a.paid_at))
  const activeIds = new Set(appointments.filter((a) => a.status !== 'cancelled').map((a) => a.id))
  const balances = (['ARS', 'USD'] as const).map((currency) => ({
    currency,
    collected: payments
      .filter((p) => p.currency === currency)
      .reduce((s, p) => s + signedAmount(p), 0),
    agreed: appointments
      .filter((a) => a.currency === currency)
      .reduce((s, a) => s + a.total_cents, 0),
    pending: appointments
      .filter((a) => a.currency === currency && a.status !== 'cancelled')
      .reduce((s, a) => s + Math.max(0, a.total_cents - paidFor(a.id, data.payments)), 0),
  }))
  const days: string[] = []
  if (!invalid) for (let d = from; d <= to && days.length <= 3660; d = shiftDay(d, 1)) days.push(d)
  const mostRequested = data.services
    .map((s) => ({
      service: s,
      count: data.appointmentServices.filter(
        (l) => l.service_id === s.id && activeIds.has(l.appointment_id ?? ''),
      ).length,
    }))
    .filter((s) => s.count > 0)
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 5)
  function exportMovements() {
    exportCsv(
      [
        [
          'Referencia',
          'Cliente',
          'Servicios',
          'Fecha del movimiento (Argentina)',
          'Tipo',
          'Importe',
          'Moneda',
          'Medio de pago',
          'Registrado por',
          'Observaciones',
        ],
        ...payments.map((p) => {
          const a = data.appointments.find((a) => a.id === p.appointment_id)
          return [
            a?.reference,
            data.customers.find((c) => c.id === a?.customer_id)?.full_name,
            serviceNames(p.appointment_id, data.appointmentServices),
            zoned(p.paid_at, 'yyyy-MM-dd HH:mm:ss'),
            KINDS[p.kind],
            (signedAmount(p) / 100).toFixed(2).replace('.', ','),
            p.currency,
            METHODS[p.method],
            data.profiles.find((u) => u.id === p.created_by)?.full_name,
            p.notes,
          ]
        }),
      ],
      `movimientos-${from}-${to}.csv`,
    )
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="LOS NÚMEROS, SIN SUPOSICIONES"
        title="Reportes de ingresos"
        description="Lo que cobraste, lo que falta y cómo evoluciona tu trabajo."
        action={
          <Button variant="secondary" onClick={exportMovements} disabled={invalid}>
            <Download size={17} />
            Exportar movimientos CSV
          </Button>
        }
      />
      <div className="panel report-filters">
        <div className="period-tabs">
          {PERIODS.map(([v, t]) => (
            <button key={v} onClick={() => setPeriod(v)} className={period === v ? 'active' : ''}>
              {t}
            </button>
          ))}
        </div>
        <select
          aria-label="Filtrar reporte por servicio"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="all">Todos los servicios</option>
          {data.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {period === 'custom' ? (
          <div className="custom-range">
            <label>
              Desde
              <input
                aria-label="Fecha inicial"
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                aria-label="Fecha final"
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
              />
            </label>
          </div>
        ) : null}
      </div>
      {invalid ? (
        <p className="form-error" role="alert">
          Elegí un rango válido de hasta 10 años, con la fecha inicial anterior a la final.
        </p>
      ) : null}
      <div className="report-date">
        <span>
          <CalendarCheck2 size={15} />
          {from} — {to}
        </span>
        <span>Zona horaria de Argentina · sin conversión de monedas</span>
      </div>
      <div className="stats-grid report-stats">
        {balances.map((b) => (
          <div className="stat-card panel" key={`paid${b.currency}`}>
            <div className="stat-top">
              <span className={`stat-icon ${b.currency === 'ARS' ? 'green' : 'violet'}`}>
                <ArrowDownLeft size={20} />
              </span>
              <span className="currency-tag">{b.currency}</span>
            </div>
            <span className="stat-label">Dinero efectivamente cobrado</span>
            <strong className="stat-value text-green">{money(b.collected, b.currency)}</strong>
            <div className="stat-bottom">Según fecha de cada movimiento</div>
          </div>
        ))}
        {balances.map((b) => (
          <div className="stat-card panel" key={`pending${b.currency}`}>
            <div className="stat-top">
              <span className="stat-icon orange">
                <Wallet size={20} />
              </span>
              <span className="currency-tag">{b.currency}</span>
            </div>
            <span className="stat-label">Pendiente de cobro</span>
            <strong className="stat-value">{money(b.pending, b.currency)}</strong>
            <div className="stat-bottom">Turnos del período · saldo a hoy</div>
          </div>
        ))}
      </div>
      <div className="panel work-statistics">
        <div>
          <strong>{appointments.length}</strong>
          <span>Turnos registrados</span>
        </div>
        <div>
          <strong>
            {
              data.appointmentServices.filter((l) =>
                appointments.some((a) => a.id === l.appointment_id),
              ).length
            }
          </strong>
          <span>Servicios acordados</span>
        </div>
        <div>
          <strong className="text-green">
            {appointments.filter((a) => a.status === 'completed').length}
          </strong>
          <span>Trabajos completados</span>
        </div>
        <div>
          <strong>{appointments.filter((a) => a.status === 'pending').length}</strong>
          <span>Pendientes</span>
        </div>
        <div>
          <strong>
            {
              appointments.filter((a) => a.status === 'confirmed' || a.status === 'rescheduled')
                .length
            }
          </strong>
          <span>Confirmados / reprogramados</span>
        </div>
        <div>
          <strong>{appointments.filter((a) => a.status === 'cancelled').length}</strong>
          <span>Cancelados</span>
        </div>
      </div>
      <div className="report-chart-heading">
        <h2>Evolución de los cobros</h2>
        <div className="segmented">
          {[
            ['day', 'Diaria'],
            ['week', 'Semanal'],
            ['month', 'Mensual'],
          ].map(([v, t]) => (
            <button
              key={v}
              className={grouping === v ? 'active' : ''}
              onClick={() => setGrouping(v as typeof grouping)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="report-charts">
        {balances.map((b) => (
          <section className="panel report-chart-card" key={b.currency}>
            <SectionHeading
              title={b.currency === 'ARS' ? 'Pesos argentinos' : 'Dólares estadounidenses'}
              subtitle="Cobros netos de devoluciones y correcciones"
              action={<span className="currency-tag">{b.currency}</span>}
            />
            <IncomeChart
              currency={b.currency}
              payments={payments}
              days={days}
              grouping={grouping}
            />
          </section>
        ))}
      </div>
      <div className="report-bottom-grid">
        <section className="panel">
          <SectionHeading
            title="Servicios más solicitados"
            subtitle="Cantidad de contrataciones · sin cancelados"
            action={<TrendingUp size={18} className="muted" />}
          />
          {mostRequested.length ? (
            <div className="top-services">
              {mostRequested.map(({ service: s, count }, i) => (
                <div key={s.id}>
                  <span className="rank">{i + 1}</span>
                  <div>
                    <p>
                      {s.name}
                      <strong>{count}</strong>
                    </p>
                    <div className="rank-track">
                      <i style={{ width: `${(count / mostRequested[0].count) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              compact
              title="Tus servicios, en perspectiva."
              description="Las contrataciones del período aparecerán acá."
              icon={<FileBarChart2 size={24} />}
            />
          )}
        </section>
        <section className="panel agreement-summary">
          <SectionHeading
            title="Valor de los trabajos"
            subtitle="Precios acordados de los turnos del período"
          />
          <div className="agreement-values">
            {balances.map((b) => (
              <div key={b.currency}>
                <span>{b.currency}</span>
                <strong>{money(b.agreed, b.currency)}</strong>
              </div>
            ))}
          </div>
          <div className="report-note">
            <CalendarCheck2 size={18} />
            <p>
              Un trabajo completado no equivale a un cobro. Los ingresos se calculan exclusivamente
              a partir de los movimientos registrados.
            </p>
          </div>
          <p className="muted small">
            El valor acordado incluye cancelados. Los saldos pendientes excluyen cancelados y
            eliminados. Un turno eliminado conserva sus pagos en este reporte.
          </p>
        </section>
      </div>
      <section className="panel movements-panel">
        <SectionHeading
          title="Historial de movimientos"
          subtitle={`${payments.length} movimientos · según la fecha real del pago o devolución`}
          action={<span className="currency-tag">ARS / USD</span>}
        />
        {payments.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Cliente / servicio</th>
                  <th>Movimiento</th>
                  <th>Importe</th>
                  <th>Medio de pago</th>
                  <th>Registrado por</th>
                  <th>
                    <span className="sr-only">Ver turno</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const a = data.appointments.find((a) => a.id === p.appointment_id)
                  return (
                    <tr key={p.id}>
                      <td>
                        {zoned(p.paid_at, 'dd MMM yyyy')}
                        <small>{zoned(p.paid_at, 'HH:mm')} · Argentina</small>
                      </td>
                      <td>
                        <strong>
                          {data.customers.find((c) => c.id === a?.customer_id)?.full_name}
                        </strong>
                        <small>
                          {serviceNames(p.appointment_id, data.appointmentServices)}
                          {a?.deleted_at ? ' · Turno eliminado' : ''}
                        </small>
                      </td>
                      <td>
                        {KINDS[p.kind]}
                        {p.notes ? <small>{p.notes}</small> : null}
                      </td>
                      <td
                        className={signedAmount(p) > 0 ? 'text-green nowrap' : 'text-orange nowrap'}
                      >
                        {money(signedAmount(p), p.currency)}
                      </td>
                      <td>{METHODS[p.method]}</td>
                      <td>{data.profiles.find((u) => u.id === p.created_by)?.full_name}</td>
                      <td>
                        <button
                          className="icon-btn"
                          onClick={() => onSelect(p.appointment_id)}
                          aria-label="Ver turno del movimiento"
                        >
                          <ArrowUpRight size={17} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Los ingresos empiezan con un cobro."
            description="Todavía no hay movimientos en este período. Crear o completar turnos no suma dinero a tus ingresos."
            icon={<Wallet size={27} />}
          />
        )}
      </section>
    </div>
  )
}
