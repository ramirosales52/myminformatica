import { rpc } from './supabase'
import type { Appointment, AppointmentService } from './types'

export type AppointmentAction = 'edit' | 'reschedule' | 'receipt' | 'repeat' | 'message' | 'payment'
export type OnAppointmentAction = (action: AppointmentAction, appointment: Appointment) => void

// Conserva las instantáneas y la versión: los atajos no saltan las reglas del servidor.
export function updateAppointment(
  appointment: Appointment,
  services: AppointmentService[],
  changes: Partial<Pick<Appointment, 'status' | 'starts_at'>>,
  requestId = crypto.randomUUID(),
) {
  return rpc('save_appointment', {
    p_workspace: appointment.workspace_id,
    p_id: appointment.id,
    p_version: appointment.version,
    p_request_id: requestId,
    p_payload: {
      ...appointment,
      ...changes,
      services: services.filter((line) => line.appointment_id === appointment.id),
    },
  })
}
