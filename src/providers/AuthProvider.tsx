import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const AuthContext = createContext<{
  session: Session | null
  loading: boolean
  recovery: boolean
  finishRecovery: () => void
}>({ session: null, loading: true, recovery: false, finishRecovery: () => {} })
export const useAuth = () => useContext(AuthContext)
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [recovery, setRecovery] = useState(false)
  useEffect(() => {
    if (!supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, value) => {
      setSession(value)
      setLoading(false)
      if (event === 'SIGNED_OUT') queryClient.clear()
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => subscription.unsubscribe()
  }, [queryClient])
  return (
    <AuthContext.Provider
      value={{ session, loading, recovery, finishRecovery: () => setRecovery(false) }}
    >
      {children}
    </AuthContext.Provider>
  )
}
