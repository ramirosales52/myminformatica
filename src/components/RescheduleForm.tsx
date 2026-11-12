import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { endTime, toUTC, zoned } from '../lib/domain'
import { updateAppointment } from '../lib/appointmentActions'
import { messageFor } from '../lib/supabase'
import type { Appointment } from '../lib/types'
import { Button, Field, Modal } from './ui'

export function RescheduleForm({
  appointment,
  onClose,
}: {
  appointment: Appointment
  onClose: () => void
}) {
  const { appointmentData: data, workspace, refresh } = useData()
  const notify = useToast()
  // No actualizar silenciosamente la versión mientras el operador está eligiendo horario.
  const [original] = useState(appointment)
  const [date, setDate] = useState(zoned(original.starts_at, 'yyyy-MM-dd'))
  const [time, setTime] = useState(zoned(original.starts_at, 'HH:mm'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const startsAt = date && time ? toUTC(`${date}T${time}`) : original.starts_at
  const moved = new Date(startsAt).getTime() !== new Date(original.starts_at).getTime()
  const overlap = data.appointments.some(
    (a) =>
      a.id !== original.id &&
      !a.deleted_at &&
      a.status !== 'cancelled' &&
      new Date(a.starts_at) < endTime({ ...original, starts_at: startsAt }) &&
      endTime(a) > new Date(startsAt),
  )
  async function save(e: FormEvent) {
    e.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (!navigator.onLine) throw new Error('No hay conexión. Reconectate antes de reprogramar.')
      await updateAppointment(original, data.appointmentServices, {
        starts_at: startsAt,
        status: ['completed', 'cancelled'].includes(original.status)
          ? original.status
          : 'rescheduled',
      })
      await refresh()
      notify('Turno reprogramado. Se conservaron sus servicios, precio y cobros.')
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Reprogramar turno"
      subtitle={`Horario anterior: ${zoned(original.starts_at, 'dd/MM/yyyy HH:mm')} · Argentina`}
      onClose={onClose}
      busy={busy}
    >
      <form className="form-stack" onSubmit={save}>
        <div className="form-grid">
          <Field label="Nueva fecha">
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Nueva hora (Argentina)">
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <p className="inline-info">
          Nuevo horario: {zoned(startsAt, 'dd/MM/yyyy HH:mm')} a{' '}
          {zoned(endTime({ ...original, starts_at: startsAt }), 'HH:mm')} · Argentina
        </p>
        {overlap ? (
          <p className="warning">
            Este horario coincide con otro turno.{' '}
            {workspace?.allow_overlap
              ? 'Los turnos simultáneos están habilitados.'
              : 'Elegí otro horario.'}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={!moved || (overlap && !workspace?.allow_overlap)}
          >
            Guardar horario
          </Button>
        </div>
      </form>
    </Modal>
  )
}
