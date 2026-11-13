import type { CSSProperties } from 'react'
import { calendarHours, daySegments, layoutSegments } from '../lib/calendarLayout'
import { duration, endTime, today, zoned } from '../lib/domain'
import type { ScheduledAppointment } from '../lib/types'
import { STATUS } from '../lib/types'
import type { OnAppointmentAction } from '../lib/appointmentActions'
import { AppointmentList } from './AppointmentList'
import { useNow } from '../lib/useNow'

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`

export function DayTimeline({
  day,
  appointments,
  onSelect,
  onNew,
  onAction,
}: {
  day: string
  appointments: ScheduledAppointment[]
  onSelect: (id: string) => void
  onNew: () => void
  onAction?: OnAppointmentAction
}) {
  const now = useNow()
  const isToday = day === zoned(now, 'yyyy-MM-dd')
  const currentHour = Number(zoned(now, 'H'))
  const currentMinute = Number(zoned(now, 'm'))
  const segments = daySegments(appointments, day)
  const hours = calendarHours(segments)
  const firstHour = isToday ? Math.min(hours[0], currentHour) : hours[0]
  const lastHour = Math.max(22, hours.at(-1)!, isToday ? currentHour : 0)
  return (
    <div className="day-timeline" aria-label="Línea de tiempo del día">
      {!segments.length ? (
        <AppointmentList appointments={[]} onSelect={onSelect} onNew={onNew} />
      ) : null}
      {Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i).map((hour) => {
        const items = segments.filter((segment) => Math.floor(segment.start / 60) === hour)
        const isCurrentHour = isToday && hour === currentHour
        return (
          <div
            className={`timeline-hour ${items.length ? 'has-appointments' : ''} ${isCurrentHour ? 'is-current-hour' : ''}`}
            key={hour}
          >
            <time>{hourLabel(hour)}</time>
            <div className="timeline-hour-content">
              {items.length ? (
                <AppointmentList
                  appointments={items.map((item) => item.appointment)}
                  onSelect={onSelect}
                  onAction={onAction}
                />
              ) : (
                <span className="timeline-free">
                  {segments.some(
                    (segment) => segment.start < (hour + 1) * 60 && segment.end > hour * 60,
                  )
                    ? 'Turno en curso'
                    : 'Sin turnos'}
                </span>
              )}
            </div>
            {isCurrentHour ? (
              <div
                className="timeline-now"
                style={{ top: `${(currentMinute / 60) * 100}%` }}
                aria-label={`Hora actual: ${zoned(now, 'HH:mm')}`}
              >
                <time dateTime={now.toISOString()}>Ahora {zoned(now, 'HH:mm')}</time>
                <span aria-hidden="true" />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export function WeekTimeGrid({
  days,
  day,
  appointments,
  onDay,
  onSelect,
}: {
  days: string[]
  day: string
  appointments: ScheduledAppointment[]
  onDay: (day: string) => void
  onSelect: (id: string) => void
}) {
  const columns = days.map((date) => ({
    date,
    segments: layoutSegments(daySegments(appointments, date)),
  }))
  const hours = calendarHours(columns.flatMap((column) => column.segments))
  const start = hours[0] * 60
  const height = hours.length * 72
  return (
    <div
      className="week-time-scroll"
      role="region"
      aria-label="Calendario semanal por hora"
      tabIndex={0}
    >
      <div className="week-time-grid">
        <div className="week-time-corner">UTC−3</div>
        {columns.map(({ date, segments }) => (
          <button
            key={date}
            className={`week-time-heading ${date === today() ? 'is-today' : ''}`}
            aria-pressed={date === day}
            onClick={() => onDay(date)}
            aria-label={`Ver turnos del ${date}`}
          >
            <span>{zoned(`${date}T12:00:00-03:00`, 'EEE')}</span>
            <strong>{Number(date.slice(8))}</strong>
            <small>
              {segments.filter((item) => item.appointment.status !== 'cancelled').length} turnos
            </small>
          </button>
        ))}
        <div className="week-time-labels" style={{ height }}>
          {hours.map((hour) => (
            <time key={hour} style={{ top: (hour * 60 - start) * 1.2 }}>
              {hourLabel(hour)}
            </time>
          ))}
        </div>
        {columns.map(({ date, segments }) => (
          <div
            key={date}
            className={`week-time-column ${date === day ? 'is-selected' : ''}`}
            style={{ height }}
            aria-label={zoned(`${date}T12:00:00-03:00`, 'EEEE d MMMM')}
          >
            {segments.map(({ appointment: a, start: from, end, lane, lanes }) => (
              <button
                key={a.id}
                className={`week-time-event status-${a.status}`}
                onClick={() => onSelect(a.id)}
                style={
                  {
                    top: (from - start) * 1.2,
                    height: (end - from) * 1.2,
                    left: `calc(${(lane * 100) / lanes}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                  } as CSSProperties
                }
                aria-label={`${a.customer_name}, ${zoned(a.starts_at, 'HH:mm')} a ${zoned(endTime(a), 'HH:mm')}, ${duration(a.duration_minutes)}, ${STATUS[a.status]}`}
                title={`${a.customer_name} · ${zoned(a.starts_at, 'HH:mm')}–${zoned(endTime(a), 'HH:mm')} · ${a.services.map((s) => s.name).join(' · ')} · ${STATUS[a.status]}`}
              >
                <time>
                  {zoned(a.starts_at, 'HH:mm')}–{zoned(endTime(a), 'HH:mm')}
                </time>
                <strong>{a.customer_name}</strong>
                <span>{a.services.map((service) => service.name).join(' · ')}</span>
                <small>
                  {STATUS[a.status]} · {a.responsible_name}
                </small>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
