import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined
export const configured = Boolean(
  url && key && !url.includes('TU_PROYECTO') && !key.includes('REEMPLAZAR'),
)
export const supabase = configured
  ? createClient(url!, key!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null
export function db() {
  if (!supabase)
    throw new Error(
      'Primero conectá tu proyecto de Supabase. Encontrás los pasos en Ajustes → Conexión.',
    )
  return supabase
}
export function messageFor(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message)
    if (message.includes('appointments_no_duplicate'))
      return 'Ya existe un turno activo de este cliente en ese horario. Revisá la agenda antes de volver a crearlo.'
    if ('code' in error && error.code === 'PGRST116')
      return 'El registro cambió o ya no está disponible. Volvé a abrirlo antes de guardar para no sobrescribir cambios de otra persona.'
    if (message.includes('customers_workspace_id_phone_key'))
      return 'Ya existe un cliente con ese teléfono. Seleccionalo o corregí su registro.'
    if (message.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
    if (message.includes('Email not confirmed'))
      return 'Confirmá tu correo antes de iniciar sesión.'
    if (message.includes('Failed to fetch') || message.includes('NetworkError'))
      return 'No hay conexión con Supabase. Verificá Internet e intentá nuevamente.'
    if (message.includes('permission denied') || message.includes('row-level security'))
      return 'No tenés permiso para esta operación. Consultá con un administrador.'
    return message
  }
  return 'No se pudo completar la operación. Intentá nuevamente.'
}
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await db().rpc(name, args)
  if (error) throw error
  return data as T
}
