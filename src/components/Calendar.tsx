import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthDays, shiftMonth, today, zoned } from '../lib/domain'
import { useData } from '../providers/DataProvider'

export function MiniCalendar({
  selected,
  onSelect,
}: {
  selected: string
  onSelect: (date: string) => void
}) {
  const [month, setMonth] = useState(selected)
  const { data } = useData()
  const dates = new Set(
    data.appointments
      .filter((a) => !a.deleted_at && a.status !== 'cancelled')
      .map((a) => zoned(a.starts_at, 'yyyy-MM-dd')),
  )
  return (
    <div className="mini-calendar">
      <div className="calendar-heading">
        <strong>{zoned(`${month}T12:00:00-03:00`, 'MMMM yyyy')}</strong>
        <div>
          <button
            className="icon-btn"
            aria-label="Mes anterior"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-btn"
            aria-label="Mes siguiente"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <span className="weekday" key={`${d}${i}`}>
            {d}
          </span>
        ))}
        {monthDays(month).map((day) => (
          <button
            key={day}
            aria-label={zoned(`${day}T12:00:00-03:00`, 'EEEE d MMMM yyyy')}
            aria-pressed={day === selected}
            className={`${day === selected ? 'selected' : ''} ${day === today() ? 'today' : ''} ${day.slice(0, 7) !== month.slice(0, 7) ? 'outside' : ''}`}
            onClick={() => onSelect(day)}
          >
            {Number(day.slice(8))}
            {dates.has(day) ? <i /> : null}
          </button>
        ))}
      </div>
      <div className="calendar-key">
        <i />
        Día con turnos<span className="ml-auto">Hora de Argentina</span>
      </div>
    </div>
  )
}
