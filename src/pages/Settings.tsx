import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  Database,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  Mail,
  Radio,
  Save,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { configured, db, messageFor } from '../lib/supabase'
import { initials } from '../lib/domain'
import { Button, Field, PageHeading, SectionHeading } from '../components/ui'

export function Settings({ initialTab }: { initialTab?: 'workspace' | 'profile' | 'connection' }) {
  const { workspace, profile, data, sync } = useData()
  const { session } = useAuth()
  const [tab, setTab] = useState<'workspace' | 'profile' | 'connection'>(
    initialTab ?? (configured ? 'workspace' : 'connection'),
  )
  return (
    <div className="page">
      <PageHeading title="Ajustes" />
      <div className="settings-layout">
        <nav className="settings-tabs" aria-label="Secciones de ajustes">
          {(
            [
              {
                id: 'workspace',
                icon: Building2,
                title: 'Negocio y equipo',
                description: 'Negocio y equipo',
              },
              {
                id: 'profile',
                icon: UserRound,
                title: 'Mi perfil',
                description: 'Datos y seguridad',
              },
              {
                id: 'connection',
                icon: Database,
                title: 'Conexión',
                description: 'Supabase y despliegue',
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={19} />
              <span>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === 'connection' ? (
            <ConnectionPanel />
          ) : tab === 'profile' ? (
            profile && session ? (
              <ProfileSettings key={profile.id} />
            ) : (
              <section className="panel settings-panel">
                <SectionHeading
                  title="Tu perfil"
                  subtitle="Disponible después de conectar Supabase e iniciar sesión."
                />
                <p className="muted">
                  El nombre del encabezado se personaliza con la cuenta que inicia sesión. No
                  depende del nombre comercial.
                </p>
                <Button variant="secondary" onClick={() => setTab('connection')}>
                  Ver configuración
                  <ArrowUpRight size={16} />
                </Button>
              </section>
            )
          ) : workspace ? (
            <>
              <section className="panel settings-panel">
                <SectionHeading
                  title="Datos del negocio"
                  subtitle="Se usan en los comprobantes, independientemente de quién inicia sesión."
                  action={<Building2 size={21} className="muted" />}
                />
                <BusinessSettings
                  key={`${workspace.id}:${workspace.name}:${workspace.allow_overlap}`}
                />
              </section>
              <section className="panel settings-panel">
                <SectionHeading
                  title="Tu equipo"
                  action={<UsersRound size={20} className="muted" />}
                />
                <div className="team-members">
                  {data.profiles.map((p) => {
                    const admin = data.members.some((m) => m.user_id === p.id && m.role === 'admin')
                    return (
                      <div className="team-member" key={p.id}>
                        <span className="avatar">{initials(p?.full_name ?? '')}</span>
                        <div>
                          <strong>
                            {p?.full_name ?? 'Integrante'}
                            {p.id === session?.user.id ? ' (vos)' : ''}
                          </strong>
                          <small>{admin ? 'Administrador' : 'Integrante'}</small>
                        </div>
                        <span className="team-badge">
                          <ShieldCheck size={15} />
                        </span>
                      </div>
                    )
                  })}
                </div>
                <p className="muted small">
                  Todas las cuentas registradas comparten los datos del negocio. No se necesitan
                  invitaciones.
                </p>
              </section>
              <section className="panel settings-panel security-note">
                <LockKeyhole size={23} />
                <div>
                  <h3>Permisos</h3>
                  <p>
                    Todos los usuarios con sesión iniciada comparten clientes, servicios, turnos,
                    cobros, reportes y mensajes. Solo los administradores cambian la configuración
                    del negocio.
                  </p>
                  <span className="live-label">
                    <span className={`tiny-dot ${sync === 'live' ? '' : 'gray'}`} />
                    {sync === 'live'
                      ? 'Sincronización en tiempo real activa'
                      : 'Reconectando con el negocio'}
                  </span>
                </div>
              </section>
            </>
          ) : session ? (
            <section className="panel settings-panel">
              <p>Conectando con el negocio compartido…</p>
            </section>
          ) : (
            <section className="panel settings-panel">
              <SectionHeading
                title="Tu negocio compartido"
                subtitle="Conectá Supabase para comenzar a guardar datos reales."
              />
              <p className="muted">
                Una vez conectada la base, cada persona crea su cuenta y accede al mismo negocio.
              </p>
              <Button onClick={() => setTab('connection')}>
                Configurar conexión
                <ArrowUpRight size={16} />
              </Button>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
function BusinessSettings() {
  const { workspace, isAdmin, refresh } = useData()
  const notify = useToast()
  const [name, setName] = useState(workspace!.name)
  const [business, setBusiness] = useState(workspace!.business_name)
  const [phone, setPhone] = useState(workspace!.business_phone)
  const [email, setEmail] = useState(workspace!.business_email)
  const [overlap, setOverlap] = useState(workspace!.allow_overlap)
  const [version, setVersion] = useState(workspace!.version)
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const { data, error } = await db()
        .from('workspaces')
        .update({
          name: name.trim(),
          business_name: business.trim(),
          business_phone: phone,
          business_email: email,
          allow_overlap: overlap,
        })
        .eq('id', workspace!.id)
        .eq('version', version)
        .select()
        .single()
      if (error) throw error
      setVersion(data.version)
      await refresh()
      notify('Ajustes del negocio guardados.')
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="form-stack">
      <fieldset disabled={!isAdmin || busy}>
        <div className="form-grid">
          <Field label="Nombre del negocio">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Nombre comercial en comprobantes">
            <input
              required
              maxLength={160}
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
            />
          </Field>
          <Field label="WhatsApp comercial">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Correo comercial">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <div className="settings-divider" />
        <div className="setting-switch">
          <div>
            <strong>Permitir turnos simultáneos</strong>
            <p>
              Si está desactivado, la base bloquea horarios superpuestos, incluso si dos personas
              agendan al mismo tiempo.
            </p>
          </div>
          <input
            className="switch"
            type="checkbox"
            checked={overlap}
            onChange={(e) => setOverlap(e.target.checked)}
            aria-label="Permitir turnos simultáneos"
          />
        </div>
        <div className="inline-info">
          <Radio size={15} />
          Zona horaria: America/Argentina/Cordoba · formato 24 horas
        </div>
      </fieldset>
      <div className="settings-save">
        <span className="muted small">
          {isAdmin
            ? 'Los cambios se aplican a todo el equipo.'
            : 'Solo administradores pueden cambiar estos datos.'}
        </span>
        <Button type="submit" disabled={!isAdmin} loading={busy}>
          <Save size={16} />
          Guardar ajustes
        </Button>
      </div>
    </form>
  )
}
function ProfileSettings() {
  const { profile, refresh } = useData()
  const { session } = useAuth()
  const notify = useToast()
  const [name, setName] = useState(profile!.full_name)
  const [phone, setPhone] = useState(profile!.phone)
  const [version, setVersion] = useState(profile!.version)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const { data, error } = await db()
        .from('profiles')
        .update({ full_name: name.trim(), phone })
        .eq('id', profile!.id)
        .eq('version', version)
        .select()
        .single()
      if (error) throw error
      setVersion(data.version)
      await refresh()
      notify('Tu perfil está actualizado.')
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault()
    if (password !== repeat) {
      notify('Las contraseñas no coinciden.', true)
      return
    }
    setBusy(true)
    try {
      const { error } = await db().auth.updateUser({ password })
      if (error) throw error
      setPassword('')
      setRepeat('')
      notify('Contraseña actualizada.')
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <section className="panel settings-panel">
        <SectionHeading
          title="Datos personales"
          action={<UserRound size={21} className="muted" />}
        />
        <form className="form-stack" onSubmit={save}>
          <div className="profile-preview">
            <span className="avatar">{initials(name)}</span>
            <div>
              <strong>Agenda de {name.split(' ')[0] || 'tu equipo'}</strong>
              <small>Así te vas a ver en la aplicación</small>
            </div>
          </div>
          <Field label="Nombre y apellido">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Teléfono personal">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Correo de inicio de sesión">
            <input readOnly type="email" value={session!.user.email ?? ''} />
          </Field>
          <div className="modal-actions">
            <Button type="submit" loading={busy}>
              <Save size={16} />
              Guardar perfil
            </Button>
          </div>
        </form>
      </section>
      <section className="panel settings-panel">
        <SectionHeading
          title="Seguridad de tu cuenta"
          subtitle="Usá una contraseña única de al menos 8 caracteres."
          action={<KeyRound size={20} className="muted" />}
        />
        <form className="form-stack" onSubmit={changePassword}>
          <Field label="Nueva contraseña">
            <input
              required
              autoComplete="new-password"
              type="password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Repetir contraseña">
            <input
              required
              autoComplete="new-password"
              type="password"
              minLength={8}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </Field>
          <div className="modal-actions">
            <Button type="submit" variant="secondary" loading={busy}>
              Cambiar contraseña
            </Button>
          </div>
        </form>
      </section>
    </>
  )
}
function ConnectionPanel() {
  const notify = useToast()
  const variables =
    'VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REEMPLAZAR'
  return (
    <>
      <section className="panel settings-panel">
        <SectionHeading
          title="Conexión a Supabase"
          action={<Database size={21} className="muted" />}
        />
        <div className={`connection-state ${configured ? 'connected' : ''}`}>
          <span className={`tiny-dot ${!configured ? 'gray' : ''}`} />
          <div>
            <strong>
              {configured ? 'Variables de conexión configuradas' : 'Falta configurar la conexión'}
            </strong>
            <p>
              {configured
                ? 'El estado de la sincronización aparece en el menú lateral. Las variables no garantizan por sí solas que las migraciones estén instaladas.'
                : 'Por seguridad, los datos no se guardan hasta que conectes tu propio proyecto.'}
            </p>
          </div>
          {configured ? <Check size={21} /> : <LockKeyhole size={21} />}
        </div>
        <ol className="connection-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Creá un proyecto nuevo</strong>
              <p>
                Usá un proyecto vacío de Supabase. No ejecutes estas migraciones en otra aplicación.
              </p>
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-link"
              >
                Abrir Supabase
                <ExternalLink size={14} />
              </a>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Instalá la base de datos</strong>
              <p>
                Aplicá los archivos de <code>supabase/migrations/</code> en orden. Incluyen tablas,
                RLS, operaciones de cobro y Realtime. La guía completa está en{' '}
                <code>README.md</code>.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Configurá las variables públicas</strong>
              <p>
                Copiá <code>.env.example</code> a <code>.env.local</code> y reemplazá estos valores.
                Reiniciá Vite. En Vercel agregá las mismas variables y volvé a desplegar.
              </p>
              <pre>{variables}</pre>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(variables)
                    notify('Ejemplo de variables copiado.')
                  } catch {
                    notify('Copiá las variables del bloque de texto.', true)
                  }
                }}
              >
                <Copy size={15} />
                Copiar ejemplo
              </Button>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>Creá las cuentas del equipo</strong>
              <p>
                Cada persona entra con su correo y contraseña. Todas acceden automáticamente al
                mismo negocio.
              </p>
            </div>
          </li>
        </ol>
        <div className="warning">
          <ShieldCheck size={19} />
          <span>
            La clave publicable es pública por diseño. Nunca coloques claves{' '}
            <code>service_role</code>, <code>sb_secret_</code> ni contraseñas de base de datos en
            variables VITE_.
          </span>
        </div>
      </section>
      <section className="panel settings-panel">
        <SectionHeading
          title="WhatsApp y comprobantes"
          action={<Mail size={20} className="muted" />}
        />
        <p className="muted">
          Los enlaces wa.me abren la conversación con el texto preparado. Vos confirmás el envío en
          WhatsApp. No hace falta configurar WhatsApp Business API.
        </p>
        <p className="muted">
          Los comprobantes se descargan como PNG o PDF. Para compartirlos se crea un enlace firmado
          que vence después de una hora. El bucket de Storage nunca es público.
        </p>
      </section>
    </>
  )
}
