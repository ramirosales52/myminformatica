import { useState } from 'react'
import {
  ArrowUpRight,
  CalendarPlus,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor } from '../lib/supabase'
import { initials, money, paidFor, signedAmount, whatsappUrl, zoned } from '../lib/domain'
import type { Customer } from '../lib/types'
import { AppointmentList } from '../components/AppointmentList'
import { Button, Empty, Modal, PageHeading } from '../components/ui'

export function Customers({
  onNew,
  onSelect,
  initialSearch = '',
}: {
  onNew: () => void
  onSelect: (c: Customer) => void
  initialSearch?: string
}) {
  const { appointmentData: data } = useData()
  const [search, setSearch] = useState(initialSearch)
  const customers = data.customers
    .filter((c) => !c.deleted_at)
    .filter((c) =>
      `${c.full_name} ${c.phone} ${c.notes}`.toLowerCase().includes(search.toLowerCase()),
    )
    .toSorted((a, b) => a.full_name.localeCompare(b.full_name))
  return (
    <div className="page">
      <PageHeading
        eyebrow="PERSONAS, NO SOLO REGISTROS"
        title="Clientes"
        description="El historial que te ayuda a dar una mejor atención."
        action={
          <Button onClick={onNew}>
            <Plus size={17} />
            Nuevo cliente
          </Button>
        }
      />
      <div className="catalog-summary">
        <span>
          <UsersRound size={19} />
          <strong>{data.customers.filter((c) => !c.deleted_at).length}</strong> clientes en la app
        </span>
        <span>Una base compartida por todo el equipo</span>
      </div>
      <div className="panel">
        <div className="catalog-toolbar">
          <div className="search-input">
            <Search size={17} />
            <input
              aria-label="Buscar clientes"
              placeholder="Buscar por nombre, WhatsApp o notas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="muted small">{customers.length} resultados</span>
        </div>
        {customers.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>WhatsApp</th>
                  <th>Trabajos</th>
                  <th>Cliente desde</th>
                  <th>Saldo pendiente</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const appointments = data.appointments.filter(
                    (a) => a.customer_id === c.id && !a.deleted_at,
                  )
                  const pending = (['ARS', 'USD'] as const).map((currency) => ({
                    currency,
                    amount: appointments
                      .filter((a) => a.currency === currency && a.status !== 'cancelled')
                      .reduce(
                        (s, a) => s + Math.max(0, a.total_cents - paidFor(a.id, data.payments)),
                        0,
                      ),
                  }))
                  return (
                    <tr key={c.id}>
                      <td>
                        <button className="customer-name" onClick={() => onSelect(c)}>
                          <span className="avatar">{initials(c.full_name)}</span>
                          <strong>{c.full_name}</strong>
                        </button>
                      </td>
                      <td>
                        {c.phone ? (
                          <a
                            className="muted-link"
                            href={whatsappUrl(c.phone, `¡Hola ${c.full_name}!`)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageCircle size={14} />
                            {c.phone}
                          </a>
                        ) : (
                          <span className="muted">Sin teléfono</span>
                        )}
                      </td>
                      <td>{appointments.length}</td>
                      <td>{zoned(c.created_at, 'dd MMM yyyy')}</td>
                      <td>
                        <div className="currency-stack">
                          {pending.filter((p) => p.amount > 0).length ? (
                            pending
                              .filter((p) => p.amount > 0)
                              .map((p) => (
                                <span key={p.currency}>{money(p.amount, p.currency)}</span>
                              ))
                          ) : (
                            <span className="text-green">Al día</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          onClick={() => onSelect(c)}
                          aria-label={`Ver historial de ${c.full_name}`}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={search ? 'No encontramos ese cliente.' : 'Cada cliente tiene su historia.'}
            description={
              search
                ? 'Probá con otro nombre o número de WhatsApp.'
                : 'Registrá tu primer cliente para guardar sus datos, trabajos y cobros en un solo lugar.'
            }
            icon={<UsersRound size={29} />}
            action={
              !search ? (
                <Button variant="secondary" onClick={onNew}>
                  <Plus size={16} />
                  Registrar cliente
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  )
}
export function CustomerDetails({
  customer,
  onClose,
  onEdit,
  onNewAppointment,
  onAppointment,
}: {
  customer: Customer
  onClose: () => void
  onEdit: (c: Customer) => void
  onNewAppointment: (c: Customer) => void
  onAppointment: (id: string) => void
}) {
  const { appointmentData: data, refresh } = useData()
  const notify = useToast()
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (
      !window.confirm(
        `¿Eliminar a ${customer.full_name}? Sus turnos y cobros se conservarán en el historial.`,
      )
    )
      return
    setBusy(true)
    try {
      const { error } = await db()
        .from('customers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', customer.id)
        .eq('version', customer.version)
        .select()
        .single()
      if (error) throw error
      await refresh()
      notify('Cliente eliminado.')
      onClose()
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  const appointments = data.appointments.filter((a) => a.customer_id === customer.id)
  const ids = new Set(appointments.map((a) => a.id))
  const balances = (['ARS', 'USD'] as const).map((currency) => ({
    currency,
    paid: data.payments
      .filter((p) => ids.has(p.appointment_id) && p.currency === currency)
      .reduce((s, p) => s + signedAmount(p), 0),
    pending: appointments
      .filter((a) => !a.deleted_at && a.status !== 'cancelled' && a.currency === currency)
      .reduce((s, a) => s + Math.max(0, a.total_cents - paidFor(a.id, data.payments)), 0),
  }))
  return (
    <Modal
      title={customer.full_name}
      subtitle={`Cliente desde ${zoned(customer.created_at, 'dd MMMM yyyy')}`}
      onClose={onClose}
      wide
      busy={busy}
    >
      <div className="customer-detail-actions">
        {customer.phone ? (
          <a
            href={whatsappUrl(customer.phone, `¡Hola ${customer.full_name}!`)}
            className="btn btn-secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={16} />
            {customer.phone}
          </a>
        ) : (
          <span className="muted">Sin teléfono</span>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => onEdit(customer)}>
          <Pencil size={15} />
          Editar datos
        </Button>
        <Button disabled={busy} onClick={() => onNewAppointment(customer)}>
          <CalendarPlus size={16} />
          Nuevo turno
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => void remove()}>
          <Trash2 size={15} />
          Eliminar cliente
        </Button>
      </div>
      <div className="customer-balances">
        {balances.map((b) => (
          <div className="panel" key={b.currency}>
            <span className="currency-tag">{b.currency}</span>
            <p>
              Cobrado <strong className="text-green">{money(b.paid, b.currency)}</strong>
            </p>
            <p>
              Pendiente <strong>{money(b.pending, b.currency)}</strong>
            </p>
          </div>
        ))}
      </div>
      {customer.notes ? (
        <div className="notes-box">
          <small>Notas del cliente</small>
          <p>{customer.notes}</p>
        </div>
      ) : null}
      <h3 className="subheading">
        <UserRound size={17} />
        Historial de trabajos
      </h3>
      <AppointmentList
        appointments={appointments.filter((a) => !a.deleted_at)}
        onSelect={onAppointment}
        showDate
      />
    </Modal>
  )
}
