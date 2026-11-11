export type Currency = 'ARS' | 'USD'
export type Status = 'pending' | 'confirmed' | 'completed' | 'rescheduled' | 'cancelled'
export type Method =
  'transfer' | 'mercadopago' | 'paypal' | 'binance' | 'cash' | 'other' | 'undefined'
export type PaymentKind = 'charge' | 'refund' | 'correction_charge' | 'correction_refund'
export interface Profile {
  id: string
  full_name: string
  phone: string
  avatar_url: string
  version: number
}
export interface Workspace {
  id: string
  name: string
  business_name: string
  business_email: string
  business_phone: string
  allow_overlap: boolean
  timezone: string
  version: number
}
export interface Member {
  workspace_id: string
  user_id: string
  role: 'admin' | 'member'
  active: boolean
}
export interface Customer {
  id: string
  workspace_id: string
  full_name: string
  phone: string
  country_code: string
  tz_offset_minutes: number | null
  notes: string
  created_at: string
  version: number
  deleted_at: string | null
}
export interface Service {
  id: string
  workspace_id: string
  name: string
  description: string
  category: string
  duration_minutes: number
  price_ars: number
  price_usd: number
  active: boolean
  version: number
  deleted_at: string | null
}
export interface Appointment {
  id: string
  workspace_id: string
  reference: string
  customer_id: string
  responsible_id: string
  starts_at: string
  duration_minutes: number
  status: Status
  currency: Currency
  total_cents: number
  payment_method: Method
  notes: string
  version: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export interface AppointmentService {
  id?: string
  appointment_id?: string
  service_id: string
  name: string
  price_cents: number
  duration_minutes: number
}
export interface ScheduledAppointment {
  id: string
  workspace_id: string
  reference: string
  starts_at: string
  duration_minutes: number
  status: Status
  responsible_id: string
  customer_name: string
  responsible_name: string
  workspace_name: string
  services: { service_id: string; name: string }[]
}
export interface Payment {
  id: string
  workspace_id: string
  appointment_id: string
  kind: PaymentKind
  amount_cents: number
  currency: Currency
  method: Method
  paid_at: string
  created_at: string
  created_by: string
  notes: string
}
export interface Template {
  id: string
  workspace_id: string
  title: string
  body: string
  category: string
  version: number
}
export interface Activity {
  id: string
  workspace_id: string
  appointment_id: string | null
  actor_id: string
  action: string
  before_data: Record<string, unknown> | null
  after_data: Record<string, unknown> | null
  created_at: string
}
export interface Notification {
  id: string
  user_id: string
  title: string
  appointment_id: string | null
  read_at: string | null
  created_at: string
}
export interface WorkspaceData {
  customers: Customer[]
  services: Service[]
  appointments: Appointment[]
  appointmentServices: AppointmentService[]
  payments: Payment[]
  templates: Template[]
  activity: Activity[]
  notifications: Notification[]
  profiles: Profile[]
  members: Member[]
}
export const EMPTY_DATA: WorkspaceData = {
  customers: [],
  services: [],
  appointments: [],
  appointmentServices: [],
  payments: [],
  templates: [],
  activity: [],
  notifications: [],
  profiles: [],
  members: [],
}
export const STATUS: Record<Status, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  completed: 'Completado',
  rescheduled: 'Reprogramado',
  cancelled: 'Cancelado',
}
export const METHODS: Record<Method, string> = {
  transfer: 'Transferencia bancaria',
  mercadopago: 'Mercado Pago',
  paypal: 'PayPal',
  binance: 'Binance',
  cash: 'Efectivo',
  other: 'Otro',
  undefined: 'Sin definir',
}
export const KINDS: Record<PaymentKind, string> = {
  charge: 'Cobro',
  refund: 'Devolución',
  correction_charge: 'Corrección positiva',
  correction_refund: 'Corrección negativa',
}
