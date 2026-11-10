import { useState } from 'react'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import {
  monthDays,
  paidFor,
  paymentState,
  serviceNames,
  shiftDay,
  shiftMonth,
  today,
  weekDays,
  zoned,
} from '../lib/domain'
import { STATUS } from '../lib/types'
import { AppointmentList } from '../components/AppointmentList'
import { Button, PageHeading } from '../components/ui'

export function Agenda({
  initialDay,
  onNew,
  onSelect,
}: {
  initialDay?: string
  onNew: (day?: string) => void
  onSelect: (id: string) => void
}) {
  const { data } = useData()
  const [day, setDay] = useState(initialDay ?? today())
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [service, setService] = useState('all')
  const [responsible, setResponsible] = useState('all')
  const [payment, setPayment] = useState('all')
  const [filters, setFilters] = useState(false)
  const appointments = data.appointments.filter((a) => {
    if (a.deleted_at) return false
    const c = data.customers.find((c) => c.id === a.customer_id)
    const haystack =
      `${c?.full_name} ${c?.phone} ${serviceNames(a.id, data.appointmentServices)}`.toLowerCase()
    return (
      haystack.includes(search.toLowerCase()) &&
      (status === 'all' || a.status === status) &&
      (responsible === 'all' || a.responsible_id === responsible) &&
      (service === 'all' ||
        data.appointmentServices.some(
          (s) => s.appointment_id === a.id && s.service_id === service,
        )) &&
      (payment === 'all' || paymentState(a.total_cents, paidFor(a.id, data.payments)) === payment)
    )
  })
  const days = weekDays(day)
  const selected = appointments.filter((a) => zoned(a.starts_at, 'yyyy-MM-dd') === day)
  const countFilters = [status, service, responsible, payment].filter((v) => v !== 'all').length
  function step(n: number) {
    setDay(view === 'month' ? shiftMonth(day, n) : shiftDay(day, n * (view === 'week' ? 7 : 1)))
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="CADA TRABAJO, EN SU LUGAR"
        title="Tu agenda"
        description="Coordiná horarios y mantené a todo el equipo al día."
        action={
          <Button onClick={() => onNew(day)}>
            <Plus size={17} />
            Nuevo turno
          </Button>
        }
      />
      <div className="panel agenda-panel">
        <div className="agenda-toolbar">
          <div className="date-navigation">
            <button className="icon-btn" aria-label="Período anterior" onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" aria-label="Período siguiente" onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
            <h2>{zoned(`${day}T12:00:00-03:00`, 'MMMM yyyy')}</h2>
            <Button variant="secondary" onClick={() => setDay(today())}>
              Hoy
            </Button>
          </div>
          <div className="segmented">
            {[
              ['day', 'Día'],
              ['week', 'Semana'],
              ['month', 'Mes'],
            ].map(([v, text]) => (
              <button
                key={v}
                className={view === v ? 'active' : ''}
                onClick={() => setView(v as typeof view)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
        <div className="agenda-searchbar">
          <div className="search-input">
            <Search size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, teléfono o servicio…"
              aria-label="Buscar turnos"
            />
          </div>
          <Button variant={filters ? 'primary' : 'secondary'} onClick={() => setFilters((v) => !v)}>
            <SlidersHorizontal size={16} />
            Filtros{countFilters ? <span className="count">{countFilters}</span> : null}
          </Button>
        </div>
        {filters ? (
          <div className="filter-row">
            <label>
              Estado
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">Todos los estados</option>
                {Object.entries(STATUS).map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Servicio
              <select value={service} onChange={(e) => setService(e.target.value)}>
                <option value="all">Todos los servicios</option>
                {data.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsable
              <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                <option value="all">Todo el equipo</option>
                {data.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {data.profiles.find((p) => p.id === m.user_id)?.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pago
              <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="all">Todos los pagos</option>
                <option value="unpaid">No pagado</option>
                <option value="partial">Pago parcial</option>
                <option value="paid">Pagado</option>
              </select>
            </label>
            <button
              className="text-link"
              onClick={() => {
                setStatus('all')
                setService('all')
                setResponsible('all')
                setPayment('all')
              }}
            >
              Limpiar
            </button>
          </div>
        ) : null}
        {view === 'week' ? (
          <div className="week-strip">
            {days.map((d) => (
              <button
                className={`${day === d ? 'active' : ''} ${d === today() ? 'is-today' : ''}`}
                key={d}
                onClick={() => setDay(d)}
              >
                <span>{zoned(`${d}T12:00:00-03:00`, 'EEE')}</span>
                <strong>{Number(d.slice(8))}</strong>
                <small>
                  {
                    appointments.filter(
                      (a) => zoned(a.starts_at, 'yyyy-MM-dd') === d && a.status !== 'cancelled',
                    ).length
                  }{' '}
                  turnos
                </small>
              </button>
            ))}
          </div>
        ) : null}
        {view === 'month' ? (
          <div className="month-view">
            {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((d) => (
              <span className="month-weekday" key={d}>
                {d}
              </span>
            ))}
            {monthDays(day).map((d) => (
              <div
                className={`month-cell ${d.slice(0, 7) !== day.slice(0, 7) ? 'outside' : ''} ${d === today() ? 'is-today' : ''}`}
                key={d}
              >
                <button
                  className="month-day"
                  onClick={() => {
                    setDay(d)
                    setView('day')
                  }}
                  aria-label={`Ver turnos del ${d}`}
                >
                  {Number(d.slice(8))}
                </button>
                {appointments
                  .filter((a) => zoned(a.starts_at, 'yyyy-MM-dd') === d)
                  .toSorted((a, b) => a.starts_at.localeCompare(b.starts_at))
                  .slice(0, 3)
                  .map((a) => (
                    <button
                      className={`month-appointment status-${a.status}`}
                      key={a.id}
                      onClick={() => onSelect(a.id)}
                    >
                      {zoned(a.starts_at, 'HH:mm')}{' '}
                      {data.customers.find((c) => c.id === a.customer_id)?.full_name.split(' ')[0]}
                    </button>
                  ))}
                {appointments.filter((a) => zoned(a.starts_at, 'yyyy-MM-dd') === d).length > 3 ? (
                  <button
                    className="month-more"
                    onClick={() => {
                      setDay(d)
                      setView('day')
                    }}
                  >
                    Ver todos
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="day-list-heading">
              <CalendarDays size={18} />
              <h3>{zoned(`${day}T12:00:00-03:00`, "EEEE d 'de' MMMM")}</h3>
              <span className="count">{selected.length}</span>
              <span className="muted ml-auto small">Argentina · UTC−3</span>
            </div>
            <AppointmentList appointments={selected} onSelect={onSelect} onNew={() => onNew(day)} />
          </>
        )}
        <div className="panel-footer">
          <Filter size={14} />
          {countFilters ? `${countFilters} filtros activos` : 'Mostrando todos los estados'}
          <span className="ml-auto">Los turnos cancelados conservan su historial.</span>
        </div>
      </div>
      <section className="panel upcoming-panel">
        <div className="section-heading">
          <div>
            <h2>Próximos turnos</h2>
            <p>Lo que sigue en tu agenda, según los filtros actuales.</p>
          </div>
        </div>
        <AppointmentList
          appointments={appointments
            .filter(
              (a) =>
                new Date(a.starts_at) >= new Date() &&
                a.status !== 'cancelled' &&
                a.status !== 'completed',
            )
            .toSorted((a, b) => a.starts_at.localeCompare(b.starts_at))
            .slice(0, 5)}
          onSelect={onSelect}
          showDate
        />
      </section>
    </div>
  )
}
