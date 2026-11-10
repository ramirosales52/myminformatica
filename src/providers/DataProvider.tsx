import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './AuthProvider'
import { db, rpc } from '../lib/supabase'
import { EMPTY_DATA } from '../lib/types'
import type { Profile, ScheduledAppointment, Workspace, WorkspaceData } from '../lib/types'

async function allRows(table: string, workspace?: string, signal?: AbortSignal) {
  const result: unknown[] = []
  for (let start = 0; ; start += 1000) {
    let request = db()
      .from(table)
      .select('*')
      .order(table === 'workspace_members' ? 'user_id' : 'id')
      .range(start, start + 999)
    if (workspace) request = request.eq('workspace_id', workspace)
    if (signal) request = request.abortSignal(signal)
    const { data, error } = await request
    if (error) throw error
    result.push(...data)
    if (data.length < 1000) return result
  }
}
interface DataContextValue {
  data: WorkspaceData
  appointmentData: WorkspaceData
  schedule: ScheduledAppointment[]
  workspace: Workspace | null
  workspaces: Workspace[]
  profile: Profile | null
  loading: boolean
  error: unknown
  sync: string
  isAdmin: boolean
  refresh: () => Promise<void>
  selectWorkspace: (id: string) => void
}
const DataContext = createContext<DataContextValue>({
  data: EMPTY_DATA,
  appointmentData: EMPTY_DATA,
  schedule: [],
  workspace: null,
  workspaces: [],
  profile: null,
  loading: false,
  error: null,
  sync: 'unconfigured',
  isAdmin: false,
  refresh: async () => {},
  selectWorkspace: () => {},
})
export const useData = () => useContext(DataContext)
export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const fullName = String(session?.user.user_metadata.full_name || 'Integrante')
  const [selected, setSelected] = useState('')
  const [sync, setSync] = useState('connecting')
  const queryClient = useQueryClient()
  const account = useQuery({
    queryKey: ['account', userId],
    enabled: Boolean(userId),
    refetchInterval: 30000,
    queryFn: async ({ signal }) => {
      await rpc('ensure_profile', { p_name: fullName })
      const [p, w, m] = await Promise.all([
        db().from('profiles').select('*').eq('id', userId!).abortSignal(signal).single(),
        db().from('workspaces').select('*').order('created_at').abortSignal(signal),
        db()
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', userId!)
          .eq('active', true)
          .abortSignal(signal),
      ])
      if (p.error) throw p.error
      if (w.error) throw w.error
      if (m.error) throw m.error
      return {
        profile: p.data as Profile,
        workspaces: w.data as Workspace[],
        ownWorkspaceIds: new Set(m.data.map((member) => member.workspace_id as string)),
      }
    },
  })
  const workspace =
    account.data?.workspaces.find((w) => w.id === selected) ??
    account.data?.workspaces.find((w) => account.data?.ownWorkspaceIds.has(w.id)) ??
    account.data?.workspaces[0] ??
    null
  const workspaceId = workspace?.id
  const schedule = useQuery({
    queryKey: ['schedule', userId],
    enabled: Boolean(userId),
    refetchInterval: 15000,
    queryFn: async ({ signal }) => {
      const rows: ScheduledAppointment[] = []
      for (let start = 0; ; start += 1000) {
        const { data, error } = await db()
          .rpc('global_schedule')
          .order('id')
          .range(start, start + 999)
          .abortSignal(signal)
        if (error) throw error
        rows.push(...(data as ScheduledAppointment[]))
        if (data.length < 1000) return rows
      }
    },
  })
  const shared = useQuery({
    queryKey: ['workspace', userId, workspaceId],
    enabled: Boolean(userId && workspaceId),
    refetchInterval: 15000,
    queryFn: async ({ signal }) => {
      const names = [
        'customers',
        'services',
        'appointments',
        'appointment_services',
        'payments',
        'message_templates',
        'activity_log',
        'notifications',
        'profiles',
        'workspace_members',
      ]
      const rows = await Promise.all(
        names.map((name) =>
          allRows(
            name,
            ['message_templates', 'notifications', 'workspace_members'].includes(name)
              ? workspaceId
              : undefined,
            signal,
          ),
        ),
      )
      return {
        customers: rows[0],
        services: rows[1],
        appointments: rows[2],
        appointmentServices: rows[3],
        payments: rows[4],
        templates: rows[5],
        activity: rows[6],
        notifications: rows[7],
        profiles: rows[8],
        members: rows[9].filter((m) => (m as { active: boolean }).active),
      } as WorkspaceData
    },
  })
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workspace', userId] }),
      queryClient.invalidateQueries({ queryKey: ['account', userId] }),
      queryClient.invalidateQueries({ queryKey: ['schedule', userId] }),
    ])
  }, [queryClient, userId])
  useEffect(() => {
    if (!userId || !workspaceId) return
    let debounce: ReturnType<typeof setTimeout>
    const reconciliation: ReturnType<typeof setTimeout>[] = []
    const invalidate = () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        void refresh()
      }, 120)
    }
    const channel = db().channel(`workspace:${workspaceId}:${userId}`)
    for (const table of [
      'customers',
      'services',
      'appointments',
      'appointment_services',
      'payments',
      'message_templates',
      'activity_log',
      'notifications',
      'workspace_members',
    ]) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(['message_templates', 'notifications', 'workspace_members'].includes(table)
            ? { filter: `workspace_id=eq.${workspaceId}` }
            : {}),
        },
        invalidate,
      )
    }
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'workspaces' },
      invalidate,
    )
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, invalidate)
    channel.subscribe((status) => {
      setSync(
        status === 'SUBSCRIBED'
          ? 'live'
          : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
            ? 'reconnecting'
            : 'connecting',
      )
      if (status === 'SUBSCRIBED') {
        void refresh()
        // Un canal recién iniciado puede estar creando su slot de replicación.
        // Reconciliar desde PostgreSQL cierra ese hueco sin depender de la entrega del evento.
        reconciliation.push(
          setTimeout(() => {
            void refresh()
          }, 1500),
          setTimeout(() => {
            void refresh()
          }, 6000),
        )
      }
    })
    const online = () => {
      invalidate()
    }
    window.addEventListener('online', online)
    return () => {
      clearTimeout(debounce)
      reconciliation.forEach(clearTimeout)
      window.removeEventListener('online', online)
      void db().removeChannel(channel)
    }
  }, [workspaceId, userId, refresh])
  const appointmentData = shared.data ?? EMPTY_DATA
  // Los módulos del negocio siguen en el espacio seleccionado; los formularios de
  // turnos usan los datos globales para no mezclar catálogos, saldos o comprobantes.
  const appointmentIds = new Set(
    appointmentData.appointments.filter((a) => a.workspace_id === workspaceId).map((a) => a.id),
  )
  const data: WorkspaceData = {
    ...appointmentData,
    customers: appointmentData.customers.filter((c) => c.workspace_id === workspaceId),
    services: appointmentData.services.filter((s) => s.workspace_id === workspaceId),
    appointments: appointmentData.appointments.filter((a) => a.workspace_id === workspaceId),
    appointmentServices: appointmentData.appointmentServices.filter(
      (s) => s.appointment_id && appointmentIds.has(s.appointment_id),
    ),
    payments: appointmentData.payments.filter((p) => p.workspace_id === workspaceId),
    activity: appointmentData.activity.filter((a) => a.workspace_id === workspaceId),
  }
  useEffect(() => {
    if (!userId || !workspaceId) return
    const reminders = () => {
      void rpc<number>('notify_upcoming', { p_workspace: workspaceId })
        .then((count) => {
          if (count > 0) void refresh()
        })
        .catch(() => {
          /* La lectura de datos ya informa errores de conexión. */
        })
    }
    reminders()
    const timer = setInterval(reminders, 30000)
    return () => clearInterval(timer)
  }, [userId, workspaceId, refresh])
  return (
    <DataContext.Provider
      value={{
        data,
        appointmentData,
        schedule: schedule.data ?? [],
        workspace,
        workspaces: account.data?.workspaces ?? [],
        profile: account.data?.profile ?? null,
        loading:
          Boolean(userId) &&
          (account.isPending || schedule.isPending || (Boolean(workspaceId) && shared.isPending)),
        error: account.error || shared.error || schedule.error,
        sync: !userId ? 'unconfigured' : !workspaceId && schedule.isSuccess ? 'polling' : sync,
        isAdmin: data.members.some((m) => m.user_id === userId && m.role === 'admin'),
        refresh,
        selectWorkspace: setSelected,
      }}
    >
      {children}
    </DataContext.Provider>
  )
}
