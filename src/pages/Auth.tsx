import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, Layers3 } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor } from '../lib/supabase'
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
            USO INTERNO
          </div>
          <h1>
            {recovery
              ? 'Nueva contraseña'
              : mode === 'signup'
                ? 'Crear cuenta'
                : mode === 'reset'
                  ? 'Recuperar acceso'
                  : 'Iniciar sesión'}
          </h1>
          {recovery || mode === 'reset' ? (
            <p>
              {recovery
                ? 'Elegí una contraseña segura para tu cuenta.'
                : 'Ingresá tu correo para recibir el enlace de recuperación.'}
            </p>
          ) : null}
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
                  ? 'Crear cuenta'
                  : mode === 'reset'
                    ? 'Enviar enlace de recuperación'
                    : 'Ingresar'}
              <ArrowRight size={18} />
            </Button>
            {mode === 'reset' ? (
              <Button type="button" variant="ghost" onClick={() => setMode('login')}>
                Volver a iniciar sesión
              </Button>
            ) : null}
          </form>
        </div>
      </div>
    </main>
  )
}
