import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  Clock3,
  Plus,
  Radio,
  Sparkles,
  UserRoundPlus,
  Wallet,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useAuth } from '../providers/AuthProvider'
import { configured } from '../lib/supabase'
import {
  initials,
  money,
  serviceNames,
  shiftDay,
  signedAmount,
  today,
  totals,
  zoned,
} from '../lib/domain'
import { useNow } from '../lib/useNow'
import type { Page } from '../lib/navigation'
import type { Currency } from '../lib/types'
import { AppointmentList } from '../components/AppointmentList'
import { MiniCalendar } from '../components/Calendar'
import { IncomeChart } from '../components/IncomeChart'
import { Badge, Button, Empty, SectionHeading, TextLink } from '../components/ui'

export function Dashboard({
  onNew,
  onCustomer,
  onSelect,
  navigate,
}: {
  onNew: () => void
  onCustomer: () => void
  onSelect: (id: string) => void
  navigate: (page: Page, day?: string) => void
}) {
  const { data, profile, workspace, sync } = useData()
  const { session } = useAuth()
  const now = useNow()
  const day = today()
  const appointments = data.appointments.filter((a) => !a.deleted_at)
  const todays = appointments.filter((a) => zoned(a.starts_at, 'yyyy-MM-dd') === day)
  const activeToday = todays.filter((a) => a.status !== 'cancelled')
  const pending = appointments.filter((a) => a.status === 'pending')
  const paymentsToday = data.payments.filter((p) => zoned(p.paid_at, 'yyyy-MM-dd') === day)
  const next = appointments
    .filter(
      (a) =>
        a.status !== 'cancelled' &&
        a.status !== 'completed' &&
        new Date(a.starts_at).getTime() >= now.getTime(),
    )
    .toSorted((a, b) => a.starts_at.localeCompare(b.starts_at))[0]
  const name = profile?.full_name.split(' ')[0]
  const totalBalances = totals(appointments, data.payments)
  const recent = data.activity
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 6))
  const weekPayments = data.payments.filter(
    (p) => zoned(p.paid_at, 'yyyy-MM-dd') >= days[0] && zoned(p.paid_at, 'yyyy-MM-dd') <= day,
  )
  const ready = Boolean(configured && session && workspace)
  const stats = [
    {
      label: 'Turnos para hoy',
      value: activeToday.length,
      icon: CalendarDays,
      color: 'blue',
      bottom: `${todays.filter((a) => a.status === 'completed').length} trabajos completados`,
      badge: 'Hoy',
    },
    {
      label: 'Por confirmar',
      value: pending.length,
      icon: CalendarClock,
      color: 'orange',
      bottom: pending.length ? 'Necesitan tu confirmación' : 'Todo al día con tu agenda',
      badge: 'Agenda',
    },
    {
      label: 'Cobrado en pesos',
      value: money(
        paymentsToday.filter((p) => p.currency === 'ARS').reduce((s, p) => s + signedAmount(p), 0),
        'ARS',
      ),
      icon: Wallet,
      color: 'green',
      bottom: 'Dinero recibido hoy · ARS',
      badge: 'Hoy',
    },
    {
      label: 'Cobrado en dólares',
      value: money(
        paymentsToday.filter((p) => p.currency === 'USD').reduce((s, p) => s + signedAmount(p), 0),
        'USD',
      ),
      icon: ArrowDownLeft,
      color: 'violet',
      bottom: 'Dinero recibido hoy · USD',
      badge: 'Hoy',
    },
  ]
  return (
    <div className="page dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">
            <span className="tiny-dot" />
            TU DÍA, BAJO CONTROL
          </div>
          <h1>
            {name ? `Hola, ${name}` : 'Todo listo para un buen día'}
            <span className="heading-spark">✦</span>
          </h1>
          <p>Una mirada a tu agenda. Más tiempo para lo que hacés mejor.</p>
        </div>
        <div className="date-chip">
          <CalendarDays size={17} />
          <span>
            {zoned(new Date(), "EEEE, d 'de' MMMM")}
            <small>{zoned(new Date(), 'yyyy')} · Argentina</small>
          </span>
        </div>
      </div>
      {!ready ? (
        <div className="setup-banner">
          <span className="setup-icon">
            <Radio size={21} />
          </span>
          <div>
            <strong>Conectá tu espacio. Empezá a trabajar en equipo.</strong>
            <p>
              Esta agenda no contiene datos de ejemplo. Conectá Supabase para guardar tus primeros
              clientes y turnos.
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('settings')}>
            Configurar conexión
            <ArrowRight size={16} />
          </Button>
        </div>
      ) : null}
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card panel" key={s.label}>
            <div className="stat-top">
              <span className={`stat-icon ${s.color}`}>
                <s.icon size={20} />
              </span>
              <span className="stat-period">{s.badge}</span>
            </div>
            <span className="stat-label">{s.label}</span>
            <strong className={`stat-value ${s.color === 'green' ? 'text-green' : ''}`}>
              {ready ? s.value : '—'}
            </strong>
            <div className="stat-bottom">
              {s.color === 'green' || s.color === 'violet' ? (
                <span className="tiny-dot" />
              ) : (
                <CheckCheck size={13} />
              )}
              {s.bottom}
            </div>
          </div>
        ))}
      </div>
      <div className="dashboard-main-grid">
        <section className="panel today-panel">
          <SectionHeading
            title="Tu agenda de hoy"
            subtitle={`${activeToday.length} turnos · ${todays.filter((a) => a.status === 'completed').length} completados`}
            action={<TextLink onClick={() => navigate('agenda')}>Ver agenda</TextLink>}
          />
          <div className="today-strip">
            <span className="today-number">{Number(day.slice(8))}</span>
            <div>
              <strong>{zoned(new Date(), 'EEEE')}</strong>
              <span>{zoned(new Date(), "MMMM 'de' yyyy")}</span>
            </div>
            <span className="live-label ml-auto">
              <span className={`tiny-dot ${sync !== 'live' ? 'gray' : ''}`} />
              {sync === 'live'
                ? 'Actualizado en tiempo real'
                : ready
                  ? 'Conectando…'
                  : 'Sin conectar'}
            </span>
          </div>
          <AppointmentList appointments={todays} onSelect={onSelect} onNew={onNew} />
          <div className="panel-footer">
            <Clock3 size={14} />
            Todos los horarios se muestran en hora de Argentina.
            <button onClick={onNew} className="text-link ml-auto">
              <Plus size={14} />
              Nuevo turno
            </button>
          </div>
        </section>
        <aside className="dashboard-calendar panel">
          <MiniCalendar selected={day} onSelect={(d) => navigate('agenda', d)} />
          <div className="quick-actions">
            <h3>Un paso menos</h3>
            <button onClick={onNew}>
              <span className="quick-icon blue">
                <CalendarCheck2 size={17} />
              </span>
              <span>Agendar un turno</span>
              <ChevronRight size={16} />
            </button>
            <button onClick={onCustomer}>
              <span className="quick-icon violet">
                <UserRoundPlus size={17} />
              </span>
              <span>Registrar cliente</span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => navigate('reports')}>
              <span className="quick-icon green">
                <Wallet size={17} />
              </span>
              <span>Revisar mis ingresos</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </aside>
      </div>
      <div className="dashboard-secondary-grid">
        <section className="panel next-panel">
          <SectionHeading
            title="En el horizonte"
            subtitle="Tu próximo trabajo"
            action={<CalendarClock size={19} className="muted" />}
          />
          {next ? (
            <div className="next-appointment">
              <Badge status={next.status} />
              <h3>{data.customers.find((c) => c.id === next.customer_id)?.full_name}</h3>
              <p>{serviceNames(next.id, data.appointmentServices)}</p>
              <div className="next-time">
                <span>{zoned(next.starts_at, 'HH:mm')}</span>
                <div>
                  {zoned(next.starts_at, 'EEEE d MMM')}
                  <small>Argentina · Remoto</small>
                </div>
              </div>
              <Button variant="secondary" className="full" onClick={() => onSelect(next.id)}>
                Ver detalle
                <ArrowUpRight size={16} />
              </Button>
            </div>
          ) : (
            <Empty
              compact
              title="Tu próximo turno, acá."
              description="Cuando agendes un trabajo, vas a ver lo que sigue de un vistazo."
              icon={<CalendarClock size={24} />}
            />
          )}
        </section>
        <section className="panel balance-panel">
          <SectionHeading
            title="Cobros de la semana"
            subtitle="Ingresos reales · últimos 7 días"
            action={<span className="currency-tag">ARS</span>}
          />
          <div className="chart-head">
            <strong>
              {ready
                ? money(
                    weekPayments
                      .filter((p) => p.currency === 'ARS')
                      .reduce((s, p) => s + signedAmount(p), 0),
                    'ARS',
                  )
                : '—'}
            </strong>
            <TextLink onClick={() => navigate('reports')}>Ver reportes</TextLink>
          </div>
          <IncomeChart payments={weekPayments} currency="ARS" days={days} />
          <div className="balance-bottom">
            {totalBalances.map((b) => (
              <div key={b.currency}>
                <span>Por cobrar · {b.currency}</span>
                <strong>{ready ? money(b.pending, b.currency as Currency) : '—'}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="panel activity-panel">
          <SectionHeading
            title="En tu equipo"
            subtitle="Últimos movimientos"
            action={
              <span className="activity-icon">
                <UsersIcon />
              </span>
            }
          />
          {recent.length ? (
            <div className="activity-list">
              {recent.map((log) => (
                <button
                  key={log.id}
                  className="activity-row"
                  disabled={!log.appointment_id}
                  onClick={() => log.appointment_id && onSelect(log.appointment_id)}
                >
                  <span className="avatar small-avatar">
                    {initials(data.profiles.find((p) => p.id === log.actor_id)?.full_name ?? '')}
                  </span>
                  <div>
                    <p>
                      <strong>
                        {data.profiles
                          .find((p) => p.id === log.actor_id)
                          ?.full_name.split(' ')[0] ?? 'Integrante'}
                      </strong>{' '}
                      · {log.action.toLowerCase()}
                    </p>
                    <small>{zoned(log.created_at, 'dd MMM · HH:mm')}</small>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              compact
              title="El equipo deja su huella."
              description="Los turnos, cobros y cambios se registran automáticamente acá."
              icon={<Radio size={23} />}
            />
          )}
          <div className="activity-bottom">
            <ShieldMini />
            Un historial compartido, sin perder detalles.
          </div>
        </section>
      </div>
      <footer className="dashboard-footer">
        <span>
          <span className="tiny-dot" />
          Hecho para tu día a día.
        </span>
        <span>
          Sin conversiones de moneda. Sin ingresos supuestos.
          <Sparkles size={13} />
        </span>
      </footer>
    </div>
  )
}
function UsersIcon() {
  return <UserRoundPlus size={18} />
}
function ShieldMini() {
  return <CheckCheck size={14} />
}
