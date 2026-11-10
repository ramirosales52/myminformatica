import { useState } from 'react'
import {
  CalendarDays,
  Clock3,
  FileCheck2,
  History,
  MessageCircle,
  Pencil,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { messageFor, rpc } from '../lib/supabase'
import {
  duration,
  endTime,
  money,
  paidFor,
  PAYMENT_STATUS,
  paymentState,
  serviceNames,
  signedAmount,
  whatsappUrl,
  zoned,
} from '../lib/domain'
import { KINDS, METHODS, STATUS } from '../lib/types'
import type { Appointment, Status } from '../lib/types'
import { Badge, Button, Modal } from './ui'

export function AppointmentDetails({
  appointmentId,
  onClose,
  onEdit,
  onPayment,
  onReceipt,
}: {
  appointmentId: string
  onClose: () => void
  onEdit: (a: Appointment) => void
  onPayment: (a: Appointment) => void
  onReceipt: (a: Appointment) => void
}) {
  const { appointmentData: data, refresh } = useData()
  const notify = useToast()
  const [busy, setBusy] = useState(false)
  const a = data.appointments.find((a) => a.id === appointmentId)
  if (!a)
    return (
      <Modal title="Turno no disponible" onClose={onClose}>
        <p className="muted">
          Este turno ya no está disponible. Actualizá la agenda e intentá de nuevo.
        </p>
      </Modal>
    )
  const customer = data.customers.find((c) => c.id === a.customer_id)
  const paid = paidFor(a.id, data.payments)
  const movements = data.payments
    .filter((p) => p.appointment_id === a.id)
    .toSorted((a, b) => b.paid_at.localeCompare(a.paid_at))
  const history = data.activity
    .filter((l) => l.appointment_id === a.id)
    .toSorted((a, b) => b.created_at.localeCompare(a.created_at))
  async function changeStatus(status: Status) {
    if (
      status === 'cancelled' &&
      !window.confirm('¿Cancelar este turno? Sus cobros y su historial se conservarán.')
    )
      return
    setBusy(true)
    try {
      await rpc('save_appointment', {
        p_workspace: a!.workspace_id,
        p_id: a!.id,
        p_version: a!.version,
        p_request_id: crypto.randomUUID(),
        p_payload: {
          ...a,
          status,
          services: data.appointmentServices.filter((s) => s.appointment_id === a!.id),
        },
      })
      await refresh()
      notify('Estado del turno actualizado.')
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  async function remove() {
    if (
      !window.confirm(
        '¿Eliminar este turno de la agenda? El historial y los movimientos económicos se conservarán para auditoría y reportes.',
      )
    )
      return
    setBusy(true)
    try {
      await rpc('delete_appointment', { p_id: a!.id, p_version: a!.version })
      await refresh()
      notify('Turno eliminado de la agenda.')
      onClose()
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={customer?.full_name ?? 'Detalle del turno'}
      subtitle={`${a.reference} · Atención remota`}
      onClose={onClose}
      wide
      busy={busy}
    >
      <div className="detail-top">
        <Badge status={a.status} />
        <span className={`payment-pill ${paymentState(a.total_cents, paid)}`}>
          {PAYMENT_STATUS[paymentState(a.total_cents, paid)]}
        </span>
        <span className="muted ml-auto">v{a.version}</span>
      </div>
      <h3 className="detail-service">{serviceNames(a.id, data.appointmentServices)}</h3>
      <div className="detail-meta">
        <span>
          <CalendarDays size={16} />
          {zoned(a.starts_at, "EEEE d 'de' MMMM")}
        </span>
        <span>
          <Clock3 size={16} />
          {zoned(a.starts_at, 'HH:mm')} – {zoned(endTime(a), 'HH:mm')} ·{' '}
          {duration(a.duration_minutes)}
        </span>
      </div>
      <div className="payment-summary">
        <div>
          <small>Total del trabajo</small>
          <strong>{money(a.total_cents, a.currency)}</strong>
        </div>
        <div>
          <small>Efectivamente cobrado</small>
          <strong className="text-green">{money(paid, a.currency)}</strong>
        </div>
        <div>
          <small>Saldo {a.status === 'cancelled' ? 'del acuerdo cancelado' : 'pendiente'}</small>
          <strong>{money(Math.max(0, a.total_cents - paid), a.currency)}</strong>
        </div>
      </div>
      <div className="detail-actions">
        <Button onClick={() => onPayment(a)}>
          <Wallet size={16} />
          Registrar movimiento
        </Button>
        {!a.deleted_at ? (
          <Button variant="secondary" onClick={() => onEdit(a)}>
            <Pencil size={16} />
            Editar / reprogramar
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => onReceipt(a)}>
          <FileCheck2 size={16} />
          Comprobante
        </Button>
        {customer ? (
          <a
            className="btn btn-secondary"
            href={whatsappUrl(
              customer.phone,
              `¡Hola ${customer.full_name}! Te escribimos por tu turno de ${serviceNames(a.id, data.appointmentServices)}.`,
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} />
            WhatsApp
          </a>
        ) : null}
      </div>
      {a.deleted_at ? (
        <div className="warning">
          Turno eliminado de la agenda. Se conserva este registro para consultar su historial y
          administrar sus movimientos reales.
        </div>
      ) : (
        <div className="detail-status">
          <label htmlFor="detail-status">Estado del turno</label>
          <select
            id="detail-status"
            value={a.status}
            disabled={busy}
            onChange={(e) => void changeStatus(e.target.value as Status)}
          >
            {Object.entries(STATUS).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="detail-info">
        <div>
          <small>Responsable</small>
          <p>{data.profiles.find((p) => p.id === a.responsible_id)?.full_name ?? 'Integrante'}</p>
        </div>
        <div>
          <small>WhatsApp del cliente</small>
          <p>{customer?.phone ?? 'Sin teléfono'}</p>
        </div>
      </div>
      {a.notes ? (
        <div className="notes-box">
          <small>Notas del trabajo</small>
          <p>{a.notes}</p>
        </div>
      ) : null}
      <h3 className="subheading">
        <Wallet size={16} />
        Movimientos de pago <span className="count">{movements.length}</span>
      </h3>
      {movements.length ? (
        <div className="movement-list">
          {movements.map((p) => (
            <div className="movement" key={p.id}>
              <span className={signedAmount(p) > 0 ? 'text-green' : 'text-orange'}>
                {money(signedAmount(p), p.currency)}
              </span>
              <div>
                <strong>
                  {KINDS[p.kind]} · {METHODS[p.method]}
                </strong>
                <small>
                  {zoned(p.paid_at, 'dd/MM/yyyy HH:mm')} ·{' '}
                  {data.profiles.find((u) => u.id === p.created_by)?.full_name ?? 'Integrante'}
                  {p.notes ? ` · ${p.notes}` : ''}
                </small>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">
          No hay cobros registrados. Completar el turno no genera ingresos.
        </p>
      )}
      <h3 className="subheading">
        <History size={16} />
        Historial del turno
      </h3>
      <div className="history-list">
        {history.map((h) => (
          <div className="history-item" key={h.id}>
            <i />
            <div>
              <strong>{h.action}</strong>
              <small>
                {data.profiles.find((p) => p.id === h.actor_id)?.full_name ?? 'Integrante'} ·{' '}
                {zoned(h.created_at, 'dd/MM HH:mm')}
              </small>
              {h.before_data?.starts_at &&
              h.after_data?.starts_at &&
              h.before_data.starts_at !== h.after_data.starts_at ? (
                <p>
                  {zoned(String(h.before_data.starts_at), 'dd/MM HH:mm')} →{' '}
                  {zoned(String(h.after_data.starts_at), 'dd/MM HH:mm')}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="modal-actions justify-between">
        {!a.deleted_at ? (
          <Button variant="danger" onClick={() => void remove()} loading={busy}>
            <Trash2 size={15} />
            Eliminar turno
          </Button>
        ) : (
          <span className="muted small">Registro archivado</span>
        )}
        <Button variant="secondary" onClick={onClose}>
          Cerrar detalle
        </Button>
      </div>
    </Modal>
  )
}
