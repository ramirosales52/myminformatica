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
import { useAuth } from '../providers/AuthProvider'
import type { OnAppointmentAction } from '../lib/appointmentActions'
import {
  monthDays,
  paidFor,
  paymentState,
  shiftDay,
  shiftMonth,
  today,
  weekDays,
  zoned,
} from '../lib/domain'
import { STATUS } from '../lib/types'
import { AppointmentList } from '../components/AppointmentList'
import { DayTimeline, WeekTimeGrid } from '../components/AgendaTimeline'
import { daySegments } from '../lib/calendarLayout'
import { Button, PageHeading } from '../components/ui'

export interface AgendaState {
  day: string
  view: 'day' | 'week' | 'month'
  search: string
  status: string
  service: string
  responsible: string
  payment: string
  filters: boolean
}

export function Agenda({
  initialDay,
  onNew,
  onSelect,
  onAction,
  savedState,
  onStateChange,
}: {
  initialDay?: string
  onNew: (day?: string) => void
  onSelect: (id: string) => void
  onAction?: OnAppointmentAction
  savedState?: AgendaState
  onStateChange?: (state: AgendaState) => void
}) {
  const { appointmentData: data, schedule } = useData()
  const { session } = useAuth()
  const [localState, setLocalState] = useState<AgendaState>(() => ({
    day: initialDay ?? today(),
    view: 'week',
    search: '',
    status: 'all',
    service: 'all',
    responsible: 'all',
    payment: 'all',
    filters: false,
  }))
  const state = savedState ?? localState
  const { day, view, search, status, service, responsible, payment, filters } = state
  function update(changes: Partial<AgendaState>) {
    const next = { ...state, ...changes }
    if (onStateChange) onStateChange(next)
    else setLocalState(next)
  }
  const setDay = (day: string) => update({ day })
  const setView = (view: AgendaState['view']) => update({ view })
  const setSearch = (search: string) => update({ search })
  const setStatus = (status: string) => update({ status })
  const setService = (service: string) => update({ service })
  const setResponsible = (responsible: string) => update({ responsible })
  const setPayment = (payment: string) => update({ payment })
  const services = [
    ...new Map(schedule.flatMap((a) => a.services).map((s) => [s.service_id, s])).values(),
  ]
  const people = [...new Map(schedule.map((a) => [a.responsible_id, a.responsible_name])).entries()]
  const appointments = schedule.filter((a) => {
    const local = data.appointments.find((item) => item.id === a.id)
    const c = data.customers.find((c) => c.id === local?.customer_id)
    const haystack =
      `${a.customer_name} ${c?.phone ?? ''} ${a.services.map((s) => s.name).join(' ')} ${a.responsible_name} ${a.workspace_name}`.toLowerCase()
    return (
      haystack.includes(search.toLowerCase()) &&
      (status === 'all' || a.status === status) &&
      (responsible === 'all' || a.responsible_id === responsible) &&
      (service === 'all' || a.services.some((s) => s.service_id === service)) &&
      (payment === 'all' ||
        (local &&
          (payment === 'outstanding'
            ? a.status !== 'cancelled' && local.total_cents > paidFor(a.id, data.payments)
            : paymentState(local.total_cents, paidFor(a.id, data.payments)) === payment)))
    )
  })
  const days = weekDays(day)
  const selected = daySegments(appointments, day).map((segment) => segment.appointment)
  const countFilters = [status, service, responsible, payment].filter((v) => v !== 'all').length
  function step(n: number) {
    setDay(view === 'month' ? shiftMonth(day, n) : shiftDay(day, n * (view === 'week' ? 7 : 1)))
  }
  return (
    <div className="page">
      <PageHeading
        title="Agenda compartida"
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
            <h2>
              {view === 'week'
                ? `${zoned(`${days[0]}T12:00:00-03:00`, 'd MMM')} – ${zoned(`${days[6]}T12:00:00-03:00`, 'd MMM yyyy')}`
                : zoned(`${day}T12:00:00-03:00`, view === 'day' ? 'd MMMM yyyy' : 'MMMM yyyy')}
            </h2>
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
                aria-pressed={view === v}
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
          <Button
            variant={filters ? 'primary' : 'secondary'}
            onClick={() => update({ filters: !filters })}
          >
            <SlidersHorizontal size={16} />
            Filtros{countFilters ? <span className="count">{countFilters}</span> : null}
          </Button>
        </div>
        <div className="agenda-shortcuts" role="group" aria-label="Filtros rápidos">
          <button
            aria-pressed={day === today()}
            onClick={() => update({ day: today(), view: 'day' })}
          >
            Hoy
          </button>
          <button
            aria-pressed={status === 'pending'}
            onClick={() => update({ status: status === 'pending' ? 'all' : 'pending' })}
          >
            Por confirmar
          </button>
          <button
            aria-pressed={payment === 'outstanding'}
            onClick={() => update({ payment: payment === 'outstanding' ? 'all' : 'outstanding' })}
          >
            Por cobrar
          </button>
          <button
            aria-pressed={responsible === session?.user.id}
            onClick={() =>
              update({
                responsible: responsible === session?.user.id ? 'all' : (session?.user.id ?? 'all'),
              })
            }
          >
            Mis turnos
          </button>
          {countFilters || search ? (
            <button
              onClick={() =>
                update({
                  status: 'all',
                  service: 'all',
                  responsible: 'all',
                  payment: 'all',
                  search: '',
                })
              }
            >
              Limpiar filtros
            </button>
          ) : null}
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
                {services.map((s) => (
                  <option key={s.service_id} value={s.service_id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Responsable
              <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                <option value="all">Todos los responsables</option>
                {people.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pago
              <select value={payment} onChange={(e) => setPayment(e.target.value)}>
                <option value="all">Todos los pagos</option>
                <option value="outstanding">Con saldo pendiente</option>
                <option value="unpaid">No pagado</option>
                <option value="partial">Pago parcial</option>
                <option value="paid">Pagado</option>
              </select>
            </label>
            <button
              className="text-link"
              onClick={() => {
                update({ status: 'all', service: 'all', responsible: 'all', payment: 'all' })
              }}
            >
              Limpiar
            </button>
          </div>
        ) : null}
        {view === 'week' ? (
          <WeekTimeGrid
            days={days}
            day={day}
            appointments={appointments}
            onDay={setDay}
            onSelect={onSelect}
          />
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
                    update({ day: d, view: 'day' })
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
                      {zoned(a.starts_at, 'HH:mm')} {a.customer_name.split(' ')[0]}
                    </button>
                  ))}
                {appointments.filter((a) => zoned(a.starts_at, 'yyyy-MM-dd') === d).length > 3 ? (
                  <button
                    className="month-more"
                    onClick={() => {
                      update({ day: d, view: 'day' })
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
            {view === 'day' ? (
              <DayTimeline
                day={day}
                appointments={appointments}
                onSelect={onSelect}
                onNew={() => onNew(day)}
                onAction={onAction}
              />
            ) : (
              <AppointmentList
                appointments={selected}
                onSelect={onSelect}
                onNew={() => onNew(day)}
                onAction={onAction}
              />
            )}
          </>
        )}
        <div className="panel-footer">
          <Filter size={14} />
          {countFilters ? `${countFilters} filtros activos` : 'Mostrando todos los estados'}
        </div>
      </div>
      <section className="panel upcoming-panel">
        <div className="section-heading">
          <div>
            <h2>Próximos turnos</h2>
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
          onAction={onAction}
        />
      </section>
    </div>
  )
}
