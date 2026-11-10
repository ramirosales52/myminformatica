import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Command,
  Home,
  Layers3,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  UsersRound,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuth } from './providers/AuthProvider'
import { useData } from './providers/DataProvider'
import { useToast } from './providers/ToastProvider'
import { configured, db, messageFor } from './lib/supabase'
import { initials, zoned } from './lib/domain'
import type { Appointment, Customer } from './lib/types'
import type { Page } from './lib/navigation'
import { AppointmentDetails } from './components/AppointmentDetails'
import { AppointmentForm } from './components/AppointmentForm'
import { CustomerForm } from './components/CustomerForm'
import { PaymentForm } from './components/PaymentForm'
import { Button, Empty } from './components/ui'
import { AuthPage, Brand } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
import { Agenda } from './pages/Agenda'
import { Customers, CustomerDetails } from './pages/Customers'
const Services = lazy(() => import('./pages/Services').then((m) => ({ default: m.Services })))
const Messages = lazy(() => import('./pages/Messages').then((m) => ({ default: m.Messages })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))
const Receipt = lazy(() => import('./components/Receipt').then((m) => ({ default: m.Receipt })))

const NAV = [
  { id: 'home', label: 'Inicio', icon: Home },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'customers', label: 'Clientes', icon: UsersRound },
  { id: 'services', label: 'Servicios', icon: Layers3 },
  { id: 'messages', label: 'Mensajes', icon: MessageSquareText },
  { id: 'reports', label: 'Reportes de ingresos', icon: ChartNoAxesCombined },
  { id: 'settings', label: 'Ajustes', icon: Settings2 },
] as const
type Overlay =
  | { kind: 'appointment'; appointment?: Appointment; customerId?: string; day?: string }
  | { kind: 'details'; id: string }
  | { kind: 'payment' | 'receipt'; appointment: Appointment }
  | { kind: 'customer'; customer?: Customer }
  | { kind: 'customerDetails'; customer: Customer }
  | null
function initialPage(): Page {
  const hash = window.location.hash.replace('#/', '')
  return NAV.some((n) => n.id === hash) ? (hash as Page) : 'home'
}

export default function App() {
  const { session, loading, recovery } = useAuth()
  const { workspace, loading: dataLoading, error, refresh } = useData()
  if (loading) return <FullLoading />
  if (configured && (!session || recovery)) return <AuthPage />
  if (session && dataLoading && !workspace) return <FullLoading />
  if (session && error && !workspace)
    return (
      <main className="onboarding">
        <Brand />
        <div className="panel onboarding-card">
          <h1>Revisemos la conexión.</h1>
          <p className="form-error">{messageFor(error)}</p>
          <p>
            Comprobá que las migraciones estén aplicadas en tu proyecto y que tengas conexión a
            Internet.
          </p>
          <Button onClick={() => void refresh()}>Volver a intentar</Button>
          <Button variant="ghost" onClick={() => void db().auth.signOut()}>
            Cerrar sesión
          </Button>
        </div>
      </main>
    )
  return <WorkspaceApp key={workspace?.id ?? 'unconfigured'} />
}
function WorkspaceApp() {
  const { session } = useAuth()
  const { data, appointmentData, schedule, profile, workspace, sync, loading, error, refresh } =
    useData()
  const notify = useToast()
  const queryClient = useQueryClient()
  const [page, setPage] = useState<Page>(initialPage)
  const [agendaDay, setAgendaDay] = useState<string>()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [mobile, setMobile] = useState(false)
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [initialSearch, setInitialSearch] = useState('')
  const [settingsTab, setSettingsTab] = useState<'workspace' | 'profile' | 'connection'>()
  const [online, setOnline] = useState(navigator.onLine)
  const searchRef = useRef<HTMLInputElement>(null)
  const unread = data.notifications.filter((n) => !n.read_at)
  const notifications = data.notifications
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 30)
  const title = NAV.find((n) => n.id === page)?.label
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)')
    const update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const hashChange = () => {
      setPage(initialPage())
      setMobile(false)
    }
    const keyboard = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setNotificationOpen(false)
        setMobile(false)
      }
    }
    const onOnline = () => setOnline(true),
      onOffline = () => setOnline(false)
    window.addEventListener('hashchange', hashChange)
    window.addEventListener('keydown', keyboard)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('hashchange', hashChange)
      window.removeEventListener('keydown', keyboard)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])
  function navigate(next: Page, day?: string) {
    setAgendaDay(day)
    setInitialSearch('')
    setPage(next)
    setMobile(false)
    setSearchOpen(false)
    if (next === 'settings') setSettingsTab(undefined)
    window.history.replaceState(null, '', `#/${next}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  function requireConnection() {
    if (!workspace || !session) {
      navigate('settings')
      notify('Esperá a que se conecte el negocio para guardar información.')
      setSettingsTab('workspace')
      return false
    }
    if (!online) {
      notify(
        'No hay conexión. Reconectate antes de guardar para evitar pérdidas de información.',
        true,
      )
      return false
    }
    return true
  }
  function newAppointment(day?: string) {
    if (requireConnection()) setOverlay({ kind: 'appointment', day })
  }
  function newCustomer() {
    if (requireConnection()) setOverlay({ kind: 'customer' })
  }
  function selectAppointment(id: string) {
    setOverlay({ kind: 'details', id })
    setSearchOpen(false)
  }
  async function signOut() {
    try {
      const { error } = await db().auth.signOut()
      if (error) throw error
      queryClient.clear()
      setOverlay(null)
    } catch (err) {
      notify(messageFor(err), true)
    }
  }
  async function markRead(id?: string) {
    try {
      let request = db()
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', session!.user.id)
      request = id ? request.eq('id', id) : request.is('read_at', null)
      const { error } = await request
      if (error) throw error
      await refresh()
    } catch (err) {
      notify(messageFor(err), true)
    }
  }
  const needle = search.trim().toLowerCase()
  const foundAppointments = needle
    ? schedule
        .filter((a) => {
          const local = appointmentData.appointments.find((item) => item.id === a.id)
          const phone =
            appointmentData.customers.find((c) => c.id === local?.customer_id)?.phone ?? ''
          return `${a.customer_name} ${phone} ${a.responsible_name} ${a.workspace_name} ${a.services.map((s) => s.name).join(' ')}`
            .toLowerCase()
            .includes(needle)
        })
        .slice(0, 4)
    : []
  const foundCustomers = needle
    ? appointmentData.customers
        .filter((c) => !c.deleted_at && `${c.full_name} ${c.phone}`.toLowerCase().includes(needle))
        .slice(0, 3)
    : []
  const foundServices = needle
    ? data.services.filter((s) => s.name.toLowerCase().includes(needle)).slice(0, 2)
    : []
  const foundTemplates = needle
    ? data.templates
        .filter((t) => `${t.title} ${t.body}`.toLowerCase().includes(needle))
        .slice(0, 2)
    : []
  const closeOverlay = () => setOverlay(null)
  const memberName = profile?.full_name ?? 'Tu perfil'
  return (
    <div className="app-shell">
      {mobile ? (
        <button
          className="sidebar-scrim"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMobile(false)}
        />
      ) : null}
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`} inert={compact && !mobile}>
        <a
          className="brand-link"
          href="#/home"
          onClick={(e) => {
            e.preventDefault()
            navigate('home')
          }}
        >
          <Brand small />
        </a>
        <div className="workspace-label">
          <span className="workspace-icon">
            <Layers3 size={15} />
          </span>
          <div>
            <strong>{workspace?.name ?? 'Tu negocio'}</strong>
          </div>
          <button
            className="icon-btn"
            aria-label="Configurar negocio"
            onClick={() => navigate('settings')}
          >
            <ChevronDown size={14} />
          </button>
        </div>
        <nav className="main-nav" aria-label="Navegación principal">
          {NAV.map((item, i) => (
            <div key={item.id}>
              {i === 6 ? <div className="nav-divider" /> : null}
              <button
                className={page === item.id ? 'active' : ''}
                onClick={() => navigate(item.id)}
                aria-current={page === item.id ? 'page' : undefined}
              >
                <item.icon size={19} strokeWidth={1.7} />
                <span>{item.label}</span>
                {item.id === 'agenda' &&
                schedule.filter((a) => a.status === 'pending').length > 0 ? (
                  <span className="nav-count">
                    {schedule.filter((a) => a.status === 'pending').length}
                  </span>
                ) : null}
                {item.id === 'home' && page === 'home' ? <span className="nav-active-dot" /> : null}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div
            className={`sync-card ${(sync === 'live' || sync === 'polling') && online ? 'connected' : ''}`}
          >
            <span className="sync-symbol">
              <Radio size={17} />
            </span>
            <div>
              <strong>
                {!online
                  ? 'Sin conexión a Internet'
                  : sync === 'live'
                    ? 'Todo sincronizado'
                    : sync === 'polling'
                      ? 'Agenda compartida conectada'
                      : configured
                        ? 'Conectando al equipo'
                        : 'Sin configurar'}
              </strong>
              <p>
                {sync === 'live' && online
                  ? 'Actualización automática'
                  : sync === 'polling' && online
                    ? 'Actualización automática cada 15 s'
                    : configured
                      ? 'Reintentaremos automáticamente'
                      : 'Configurá la conexión'}
              </p>
            </div>
            <span
              className={`tiny-dot ${(sync === 'live' || sync === 'polling') && online ? '' : 'gray'}`}
            />
          </div>
          <button
            className="sidebar-help"
            onClick={() => {
              navigate('settings')
              setSettingsTab('connection')
            }}
          >
            <CircleHelp size={17} />
            <span>Configuración y ayuda</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-profile">
            <button
              className="profile-main"
              onClick={() => {
                navigate('settings')
                setSettingsTab('profile')
              }}
            >
              <span className="avatar profile-avatar">{initials(memberName)}</span>
              <span>
                <strong>{memberName}</strong>
                <small>{session ? 'Mi perfil' : 'Sin sesión'}</small>
              </span>
            </button>
            {session ? (
              <button
                className="icon-btn"
                aria-label="Cerrar sesión"
                onClick={() => void signOut()}
              >
                <LogOut size={17} />
              </button>
            ) : (
              <ShieldCheck size={18} className="muted" />
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell" inert={compact && mobile}>
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            aria-label="Abrir navegación"
            onClick={() => setMobile(true)}
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            <span>{profile ? `Agenda de ${profile.full_name.split(' ')[0]}` : 'Tu agenda'}</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="global-search">
            <Search size={17} />
            <input
              ref={searchRef}
              aria-label="Búsqueda global"
              value={search}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearch(e.target.value)
                setSearchOpen(true)
              }}
              placeholder="Buscá turnos, clientes o servicios…"
            />
            <kbd>
              <Command size={11} />K
            </kbd>
            {searchOpen && needle ? (
              <>
                <button
                  className="dropdown-dismiss"
                  aria-label="Cerrar búsqueda"
                  onClick={() => setSearchOpen(false)}
                />
                <div className="search-results">
                  <div className="dropdown-title">
                    RESULTADOS
                    <button
                      className="icon-btn"
                      aria-label="Cerrar resultados"
                      onClick={() => setSearchOpen(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {foundCustomers.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setOverlay({ kind: 'customerDetails', customer: c })
                        setSearchOpen(false)
                      }}
                    >
                      <UsersRound size={16} />
                      <span>
                        <strong>{c.full_name}</strong>
                        <small>Cliente · {c.phone || 'Sin teléfono'}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {foundAppointments.map((a) => (
                    <button key={a.id} onClick={() => selectAppointment(a.id)}>
                      <CalendarDays size={16} />
                      <span>
                        <strong>{a.customer_name}</strong>
                        <small>Turno · {zoned(a.starts_at, 'dd MMM HH:mm')}</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {foundServices.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        navigate('services')
                        setInitialSearch(s.name)
                      }}
                    >
                      <Layers3 size={16} />
                      <span>
                        <strong>{s.name}</strong>
                        <small>Servicio</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {foundTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        navigate('messages')
                        setInitialSearch(t.title)
                      }}
                    >
                      <MessageSquareText size={16} />
                      <span>
                        <strong>{t.title}</strong>
                        <small>Plantilla de mensaje</small>
                      </span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {!foundCustomers.length &&
                  !foundAppointments.length &&
                  !foundServices.length &&
                  !foundTemplates.length ? (
                    <p className="search-no-results">
                      No encontramos coincidencias. Probá con otro nombre, teléfono o servicio.
                    </p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="topbar-actions">
            <div className="notifications-wrap">
              <button
                className={`icon-btn notification-bell ${notificationOpen ? 'active' : ''}`}
                aria-label={`Notificaciones: ${unread.length} sin leer`}
                aria-expanded={notificationOpen}
                onClick={() => {
                  setNotificationOpen((v) => !v)
                  setSearchOpen(false)
                }}
              >
                <Bell size={20} />
                {unread.length ? <span>{unread.length > 9 ? '9+' : unread.length}</span> : null}
              </button>
              {notificationOpen ? (
                <>
                  <button
                    className="dropdown-dismiss"
                    aria-label="Cerrar notificaciones"
                    onClick={() => setNotificationOpen(false)}
                  />
                  <div className="notifications-dropdown">
                    <div className="dropdown-title">
                      Notificaciones<span className="count">{unread.length}</span>
                      <button
                        className="icon-btn ml-auto"
                        aria-label="Cerrar notificaciones"
                        onClick={() => setNotificationOpen(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                    {notifications.length ? (
                      <>
                        <button className="text-link mark-read" onClick={() => void markRead()}>
                          <Check size={14} />
                          Marcar todas como leídas
                        </button>
                        <div className="notification-list">
                          {notifications.map((n) => (
                            <button
                              key={n.id}
                              className={n.read_at ? 'read' : ''}
                              onClick={() => {
                                void markRead(n.id)
                                if (n.appointment_id) selectAppointment(n.appointment_id)
                                setNotificationOpen(false)
                              }}
                            >
                              <span className="notification-icon">
                                <CalendarDays size={17} />
                              </span>
                              <span>
                                <strong>{n.title}</strong>
                                <small>{zoned(n.created_at, 'dd MMM · HH:mm')}</small>
                              </span>
                              {!n.read_at ? <i /> : null}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <Empty compact title="Sin notificaciones" icon={<Bell size={23} />} />
                    )}
                  </div>
                </>
              ) : null}
            </div>
            <span className="topbar-divider" />
            <button
              className="topbar-profile"
              onClick={() => {
                navigate('settings')
                setSettingsTab('profile')
              }}
              aria-label="Abrir mi perfil"
            >
              <span className="avatar">{initials(memberName)}</span>
              <ChevronDown size={13} />
            </button>
            <Button className="topbar-new" onClick={() => newAppointment()}>
              <Plus size={18} />
              <span>Nuevo turno</span>
            </Button>
          </div>
        </header>
        {!online ? (
          <div className="offline-banner" role="status">
            <WifiOff size={16} />
            Estás sin conexión. Los datos visibles pueden estar desactualizados; no cierres un
            formulario sin guardar.
          </div>
        ) : null}
        {error ? (
          <div className="offline-banner" role="alert">
            {messageFor(error)}
            <button onClick={() => void refresh()} className="text-link">
              Reintentar
              <ArrowRight size={14} />
            </button>
          </div>
        ) : null}
        <main id="main-content">
          <Suspense fallback={<PageLoading />}>
            {loading && session ? (
              <PageLoading />
            ) : page === 'home' ? (
              <Dashboard
                onNew={() => newAppointment()}
                onCustomer={newCustomer}
                onSelect={selectAppointment}
                navigate={navigate}
              />
            ) : page === 'agenda' ? (
              <Agenda
                key={agendaDay ?? 'agenda'}
                initialDay={agendaDay}
                onNew={newAppointment}
                onSelect={selectAppointment}
              />
            ) : page === 'customers' ? (
              <Customers
                key={initialSearch}
                initialSearch={initialSearch}
                onNew={newCustomer}
                onSelect={(customer) => setOverlay({ kind: 'customerDetails', customer })}
              />
            ) : page === 'services' ? (
              <Services
                key={initialSearch}
                initialSearch={initialSearch}
                onRequireConnection={requireConnection}
              />
            ) : page === 'messages' ? (
              <Messages
                key={initialSearch}
                initialSearch={initialSearch}
                onRequireConnection={requireConnection}
              />
            ) : page === 'reports' ? (
              <Reports onSelect={selectAppointment} />
            ) : (
              <Settings key={settingsTab ?? 'settings'} initialTab={settingsTab} />
            )}
          </Suspense>
        </main>
      </div>
      <Suspense
        fallback={
          <div className="modal-backdrop">
            <div className="loading-card">
              <LoaderCircle className="spin" size={26} />
              Preparando el comprobante…
            </div>
          </div>
        }
      >
        {overlay?.kind === 'appointment' ? (
          <AppointmentForm
            appointment={overlay.appointment}
            initialCustomer={overlay.customerId}
            initialDay={overlay.day}
            onClose={closeOverlay}
          />
        ) : overlay?.kind === 'details' ? (
          <AppointmentDetails
            appointmentId={overlay.id}
            onClose={closeOverlay}
            onEdit={(appointment) => setOverlay({ kind: 'appointment', appointment })}
            onPayment={(appointment) => setOverlay({ kind: 'payment', appointment })}
            onReceipt={(appointment) => setOverlay({ kind: 'receipt', appointment })}
          />
        ) : overlay?.kind === 'payment' ? (
          <PaymentForm
            appointment={
              appointmentData.appointments.find((a) => a.id === overlay.appointment.id) ??
              overlay.appointment
            }
            onClose={closeOverlay}
          />
        ) : overlay?.kind === 'receipt' ? (
          <Receipt
            appointment={
              appointmentData.appointments.find((a) => a.id === overlay.appointment.id) ??
              overlay.appointment
            }
            onClose={closeOverlay}
          />
        ) : overlay?.kind === 'customer' ? (
          <CustomerForm customer={overlay.customer} onClose={closeOverlay} />
        ) : overlay?.kind === 'customerDetails' ? (
          <CustomerDetails
            customer={
              appointmentData.customers.find((c) => c.id === overlay.customer.id) ??
              overlay.customer
            }
            onClose={closeOverlay}
            onEdit={(customer) => setOverlay({ kind: 'customer', customer })}
            onNewAppointment={(customer) =>
              setOverlay({ kind: 'appointment', customerId: customer.id })
            }
            onAppointment={selectAppointment}
          />
        ) : null}
      </Suspense>
    </div>
  )
}
function FullLoading() {
  return (
    <div className="full-loading">
      <Brand />
      <LoaderCircle className="spin" size={28} />
      <p>Cargando…</p>
    </div>
  )
}
function PageLoading() {
  return (
    <div className="page-loading" role="status">
      <LoaderCircle className="spin" size={26} />
      <span>Cargando…</span>
    </div>
  )
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() {
    return { error: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de interfaz:', error.name, info.componentStack)
  }
  render() {
    return this.state.error ? (
      <main className="onboarding">
        <Brand />
        <div className="panel onboarding-card">
          <h1>No se pudo abrir esta vista.</h1>
          <p>
            Los datos confirmados siguen guardados en Supabase. Volvé a cargar la aplicación para
            reconectarte.
          </p>
          <Button onClick={() => window.location.reload()}>
            <ArrowLeft size={16} />
            Volver a la aplicación
          </Button>
        </div>
      </main>
    ) : (
      this.props.children
    )
  }
}
