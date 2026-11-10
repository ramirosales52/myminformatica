import { duration, zoned } from '../lib/domain'
import type { ScheduledAppointment } from '../lib/types'
import { Badge, Button, Modal } from './ui'

export function ScheduledAppointmentDetails({
  appointment,
  onClose,
}: {
  appointment: ScheduledAppointment
  onClose: () => void
}) {
  return (
    <Modal title={appointment.customer_name} subtitle={appointment.reference} onClose={onClose}>
      <Badge status={appointment.status} />
      <h3 className="detail-service">{appointment.services.map((s) => s.name).join(' · ')}</h3>
      <div className="detail-info">
        <div>
          <small>Fecha y hora · Argentina</small>
          <p>
            {zoned(appointment.starts_at, 'dd/MM/yyyy HH:mm')} ·{' '}
            {duration(appointment.duration_minutes)}
          </p>
        </div>
        <div>
          <small>Responsable</small>
          <p>{appointment.responsible_name}</p>
        </div>
        <div>
          <small>Espacio de trabajo</small>
          <p>{appointment.workspace_name}</p>
        </div>
      </div>
      <p className="muted small">
        Solo lectura. La edición, los cobros y las notas privadas quedan a cargo del espacio de
        trabajo del turno.
      </p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cerrar detalle
        </Button>
      </div>
    </Modal>
  )
}
