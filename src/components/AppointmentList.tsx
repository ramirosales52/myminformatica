import { ArrowUpRight, Clock3, Monitor, Plus } from 'lucide-react'
import { useData } from '../providers/DataProvider'
import {
  duration,
  initials,
  money,
  paidFor,
  PAYMENT_STATUS,
  paymentState,
  serviceNames,
  zoned,
} from '../lib/domain'
import type { Appointment, ScheduledAppointment } from '../lib/types'
import { Badge, Button, Empty } from './ui'

export function AppointmentList({
  appointments,
  onSelect,
  onNew,
  showDate = false,
}: {
  appointments: (Appointment | ScheduledAppointment)[]
  onSelect: (id: string) => void
  onNew?: () => void
  showDate?: boolean
}) {
  const { data } = useData()
  if (!appointments.length)
    return (
      <Empty
        title="Un día con espacio para más."
        description="Todavía no hay turnos para esta fecha. Agendá un trabajo y compartilo con tu equipo."
        action={
          onNew ? (
            <Button variant="secondary" onClick={onNew}>
              <Plus size={16} />
              Agendar un turno
            </Button>
          ) : undefined
        }
      />
    )
  return (
    <div className="appointment-list">
      {appointments
        .toSorted((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((a) => {
          const summary = 'customer_name' in a ? a : undefined
          const local = data.appointments.find((item) => item.id === a.id)
          const customerName =
            summary?.customer_name ??
            data.customers.find((c) => c.id === local?.customer_id)?.full_name ??
            'Cliente'
          const paid = paidFor(a.id, data.payments)
          const state = local ? paymentState(local.total_cents, paid) : undefined
          return (
            <button
              className={`appointment-row ${a.status === 'cancelled' ? 'is-cancelled' : ''}`}
              key={a.id}
              onClick={() => onSelect(a.id)}
            >
              <div className="appointment-time">
                <strong>{zoned(a.starts_at, 'HH:mm')}</strong>
                <span>
                  {showDate ? zoned(a.starts_at, 'dd MMM') : duration(a.duration_minutes)}
                </span>
              </div>
              <span className={`avatar avatar-${a.status}`}>{initials(customerName)}</span>
              <div className="appointment-main">
                <strong>{customerName}</strong>
                <span>
                  <Monitor size={13} />
                  {summary
                    ? summary.services.map((s) => s.name).join(' · ')
                    : serviceNames(a.id, data.appointmentServices)}
                </span>
                <small>
                  <Clock3 size={12} />
                  {duration(a.duration_minutes)} · {summary?.workspace_name ?? 'Remoto'}
                </small>
              </div>
              <div className="appointment-state">
                <Badge status={a.status} />
                {state ? (
                  <span className={`payment-text ${state}`}>{PAYMENT_STATUS[state]}</span>
                ) : (
                  <span className="muted small">Solo lectura</span>
                )}
              </div>
              <div className="appointment-amount">
                {local ? (
                  <>
                    <strong>{money(local.total_cents, local.currency)}</strong>
                    <span>
                      {paid > 0 ? `${money(paid, local.currency)} cobrado` : 'Sin cobros'}
                    </span>
                  </>
                ) : (
                  <span>{summary?.responsible_name}</span>
                )}
              </div>
              <ArrowUpRight className="row-arrow" size={17} />
            </button>
          )
        })}
    </div>
  )
}
