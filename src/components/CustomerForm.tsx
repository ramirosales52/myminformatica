import { useState } from 'react'
import type { FormEvent } from 'react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor } from '../lib/supabase'
import { normalizeOptionalPhone } from '../lib/domain'
import type { Customer } from '../lib/types'
import { Button, Field, Modal } from './ui'

export function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer?: Customer
  onClose: () => void
  onSaved?: (customer: Customer) => void
}) {
  const { workspace, refresh } = useData()
  const notify = useToast()
  const [name, setName] = useState(customer?.full_name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [code, setCode] = useState(customer?.country_code ?? '+54')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (!workspace) throw new Error('Conectá tu espacio de trabajo antes de guardar.')
      const values = {
        full_name: name.trim(),
        phone: normalizeOptionalPhone(phone, code),
        country_code: code,
        notes,
      }
      const request = customer
        ? db()
            .from('customers')
            .update(values)
            .eq('id', customer.id)
            .eq('version', customer.version)
        : db()
            .from('customers')
            .insert({ ...values, workspace_id: workspace.id })
      const { data, error } = await request.select().single()
      if (error) throw error
      await refresh()
      notify(customer ? 'Cliente actualizado.' : 'Cliente registrado.')
      onSaved?.(data as Customer)
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={customer ? 'Editar cliente' : 'Nuevo cliente'}
      subtitle="Sus datos estarán disponibles para todo el equipo."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={save} className="form-stack">
        <Field label="Nombre y apellido">
          <input
            autoComplete="name"
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del cliente"
          />
        </Field>
        <div className="form-row code-row">
          <Field label="Código de país">
            <input
              required
              pattern="\+[1-9][0-9]{0,3}"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field
            label="WhatsApp (opcional)"
            hint="Podés dejarlo vacío. Si lo ingresás, usá el número internacional con +."
          >
            <input
              autoComplete="tel"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+54 9 351 123 4567"
            />
          </Field>
        </div>
        <Field label="Notas del cliente">
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Información útil para la próxima atención…"
          />
        </Field>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Guardar cliente
          </Button>
        </div>
      </form>
    </Modal>
  )
}
