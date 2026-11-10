import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  CalendarCheck2,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Layers3,
  LockKeyhole,
  Monitor,
  Radio,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor, rpc } from '../lib/supabase'
import { Button, Field } from '../components/ui'

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'brand-small' : ''}`}>
      <span className="brand-mark">
        <Layers3 size={small ? 21 : 25} strokeWidth={1.8} />
      </span>
      <span>
        tu agenda<span className="brand-dot">.</span>
      </span>
    </div>
  )
}
export function AuthPage() {
  const { recovery, finishRecovery } = useAuth()
  const notify = useToast()
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (recovery) {
        const { error } = await db().auth.updateUser({ password })
        if (error) throw error
        finishRecovery()
        notify('Contraseña actualizada.')
      } else if (mode === 'login') {
        const { error } = await db().auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await db().auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        if (!data.session) {
          notify('Revisá tu correo para confirmar la cuenta y después iniciá sesión.')
          setMode('login')
        }
      } else {
        const { error } = await db().auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        notify('Si el correo está registrado, recibirás un enlace para cambiar la contraseña.')
        setMode('login')
      }
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-left">
        <Brand />
        <div className="auth-form-wrap">
          <div className="auth-eyebrow">
            <span className="tiny-dot" />
            TU ESPACIO DE TRABAJO
          </div>
          <h1>
            {recovery
              ? 'Una nueva contraseña.'
              : mode === 'signup'
                ? 'Empezá a organizarte.'
                : mode === 'reset'
                  ? 'Recuperá tu acceso.'
                  : 'Qué bueno verte.'}
          </h1>
          <p>
            {recovery
              ? 'Elegí una contraseña segura para tu cuenta.'
              : mode === 'signup'
                ? 'Creá tu cuenta y compartí una sola agenda con tu equipo.'
                : mode === 'reset'
                  ? 'Te enviamos un enlace seguro para volver a tu agenda.'
                  : 'Tu agenda, tus clientes y tus cobros. Todo en su lugar.'}
          </p>
          {!recovery && mode !== 'reset' ? (
            <div className="auth-tabs">
              <button
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
                className={mode === 'login' ? 'active' : ''}
              >
                Iniciar sesión
              </button>
              <button
                onClick={() => {
                  setMode('signup')
                  setError('')
                }}
                className={mode === 'signup' ? 'active' : ''}
              >
                Crear cuenta
              </button>
            </div>
          ) : null}
          <form onSubmit={submit} className="form-stack">
            {mode === 'signup' && !recovery ? (
              <Field label="Tu nombre">
                <input
                  autoComplete="name"
                  required
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="¿Cómo te llamás?"
                />
              </Field>
            ) : null}
            {!recovery ? (
              <Field label="Correo electrónico">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vos@ejemplo.com"
                />
              </Field>
            ) : null}
            {mode !== 'reset' || recovery ? (
              <Field label="Contraseña">
                <div className="password-input">
                  <input
                    type={show ? 'text' : 'password'}
                    autoComplete={
                      mode === 'signup' || recovery ? 'new-password' : 'current-password'
                    }
                    required
                    minLength={mode === 'signup' || recovery ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'Al menos 8 caracteres' : 'Tu contraseña'}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShow((s) => !s)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            ) : null}
            {mode === 'login' && !recovery ? (
              <button
                type="button"
                className="text-link auth-forgot"
                onClick={() => setMode('reset')}
              >
                Olvidé mi contraseña
              </button>
            ) : null}
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <Button className="full auth-submit" type="submit" loading={busy}>
              {recovery
                ? 'Guardar contraseña'
                : mode === 'signup'
                  ? 'Crear mi cuenta'
                  : mode === 'reset'
                    ? 'Enviar enlace de recuperación'
                    : 'Entrar a mi agenda'}
              <ArrowRight size={18} />
            </Button>
            {mode === 'reset' ? (
              <Button type="button" variant="ghost" onClick={() => setMode('login')}>
                Volver a iniciar sesión
              </Button>
            ) : null}
          </form>
          <div className="auth-security">
            <LockKeyhole size={14} />
            Acceso seguro · Datos privados de tu equipo
          </div>
        </div>
        <div className="auth-bottom">
          Hecho para trabajar mejor, juntos.<span>Argentina · UTC−3</span>
        </div>
      </div>
      <aside className="auth-right">
        <div className="auth-right-top">
          <span>
            <Monitor size={15} />
            SERVICIO TÉCNICO, BIEN ORGANIZADO
          </span>
          <span className="live-badge">
            <span className="tiny-dot" />
            En equipo
          </span>
        </div>
        <div className="auth-pitch">
          <span className="eyebrow">MENOS IDAS Y VUELTAS. MÁS CLARIDAD.</span>
          <h2>
            Un equipo.
            <br />
            Una sola <span>agenda.</span>
          </h2>
          <p>
            Del primer mensaje al último cobro.
            <br />
            Un lugar para que todo fluya.
          </p>
        </div>
        <div className="workflow-card">
          <div className="workflow-heading">
            <span className="workflow-icon">
              <CalendarCheck2 size={22} />
            </span>
            <div>
              <strong>Cada trabajo, de principio a fin</strong>
              <small>Un flujo simple. Nada se pierde.</small>
            </div>
            <Sparkles className="muted ml-auto" size={19} />
          </div>
          <div className="workflow-track">
            {[
              { icon: CalendarCheck2, label: 'Agendá', text: 'Cliente, servicio y horario' },
              { icon: UsersRound, label: 'Coordiná', text: 'Tu equipo, sincronizado' },
              { icon: Check, label: 'Cobrá', text: 'Cada movimiento registrado' },
            ].map((step, i) => (
              <div className="workflow-step" key={step.label}>
                <span>
                  <step.icon size={18} />
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <small>{step.text}</small>
                </div>
                {i < 2 ? <ChevronRight size={17} className="muted" /> : null}
              </div>
            ))}
          </div>
          <div className="workflow-footer">
            <ShieldCheck size={15} />
            Solo vos y las personas que invites.
          </div>
        </div>
        <div className="auth-features">
          <span>
            <Radio size={17} />
            Sincronización en tiempo real
          </span>
          <span>
            <ShieldCheck size={17} />
            Información protegida
          </span>
        </div>
        <div className="auth-orbit" aria-hidden="true" />
      </aside>
    </main>
  )
}
export function WorkspaceOnboarding() {
  const { refresh } = useData()
  const notify = useToast()
  const initialToken = new URLSearchParams(window.location.hash.slice(1)).get('invitation') ?? ''
  const [join, setJoin] = useState(Boolean(initialToken))
  const [name, setName] = useState('Nuestro espacio')
  const [token, setToken] = useState(initialToken)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await rpc(
        join ? 'join_workspace' : 'create_workspace',
        join
          ? {
              p_token: token.trim().includes('#invitation=')
                ? token.trim().split('#invitation=')[1]
                : token.trim(),
            }
          : { p_name: name.trim() },
      )
      if (window.location.hash.includes('invitation='))
        window.history.replaceState(null, '', window.location.pathname)
      await refresh()
      notify(
        join
          ? 'Ya sos parte del equipo.'
          : 'Espacio de trabajo creado. Configurá los precios de tus servicios antes de empezar.',
      )
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="onboarding">
      <Brand />
      <div className="onboarding-card panel">
        <span className="welcome-icon">
          <UsersRound size={32} />
        </span>
        <h1>Un lugar para tu equipo.</h1>
        <p>
          Creá un espacio compartido o sumate con una invitación. Cada integrante conserva su propia
          cuenta.
        </p>
        <div className="auth-tabs">
          <button className={!join ? 'active' : ''} onClick={() => setJoin(false)}>
            Crear espacio
          </button>
          <button className={join ? 'active' : ''} onClick={() => setJoin(true)}>
            Tengo una invitación
          </button>
        </div>
        <form onSubmit={submit} className="form-stack">
          {join ? (
            <Field label="Código o enlace de invitación">
              <textarea
                rows={3}
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Pegá la invitación que te compartió el administrador"
              />
            </Field>
          ) : (
            <Field label="Nombre del espacio">
              <input
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="full" loading={busy}>
            {join ? 'Unirme al equipo' : 'Crear espacio de trabajo'}
            <ArrowRight size={17} />
          </Button>
        </form>
        <Button variant="ghost" onClick={() => void db().auth.signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </main>
  )
}
