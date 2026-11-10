import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Check,
  Copy,
  MessageCircle,
  MessagesSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Variable,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor } from '../lib/supabase'
import { fillTemplate, serviceNames, whatsappUrl, zoned } from '../lib/domain'
import type { Template } from '../lib/types'
import { Button, Empty, Field, Modal, PageHeading } from '../components/ui'

export function Messages({
  onRequireConnection,
  initialSearch = '',
}: {
  onRequireConnection: () => boolean
  initialSearch?: string
}) {
  const { data, refresh } = useData()
  const notify = useToast()
  const [search, setSearch] = useState(initialSearch)
  const [category, setCategory] = useState('all')
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const [sending, setSending] = useState<Template | null>(null)
  const [copied, setCopied] = useState('')
  const templates = data.templates
    .filter(
      (t) =>
        `${t.title} ${t.body}`.toLowerCase().includes(search.toLowerCase()) &&
        (category === 'all' || t.category === category),
    )
    .toSorted((a, b) => a.title.localeCompare(b.title))
  async function copy(t: Template) {
    try {
      await navigator.clipboard.writeText(t.body)
      setCopied(t.id)
      notify('Plantilla copiada con su formato.')
      setTimeout(() => setCopied(''), 2500)
    } catch {
      notify(
        'No se pudo acceder al portapapeles. Usá una conexión HTTPS o copiá el texto desde el editor.',
        true,
      )
    }
  }
  async function remove(t: Template) {
    if (!window.confirm(`¿Eliminar la plantilla «${t.title}» para todo el equipo?`)) return
    try {
      const { error } = await db()
        .from('message_templates')
        .delete()
        .eq('id', t.id)
        .eq('version', t.version)
        .select()
        .single()
      if (error) throw error
      await refresh()
      notify('Mensaje eliminado.')
    } catch (err) {
      notify(messageFor(err), true)
    }
  }
  return (
    <div className="page">
      <PageHeading
        eyebrow="LAS PALABRAS JUSTAS, A MANO"
        title="Mensajes"
        description="Respuestas que ahorran tiempo, con el toque de tu equipo."
        action={
          <Button
            onClick={() => {
              if (onRequireConnection()) setEditing('new')
            }}
          >
            <Plus size={17} />
            Nuevo mensaje
          </Button>
        }
      />
      <div className="messages-info">
        <Variable size={20} />
        <div>
          <strong>Un mensaje, cada cliente.</strong>
          <p>
            Usá variables como {'{nombre_cliente}'} o {'{fecha}'}. Al preparar el envío se completan
            con los datos del turno.
          </p>
        </div>
        <span className="whatsapp-tag">
          <MessageCircle size={15} />
          Listos para WhatsApp
        </span>
      </div>
      <div className="panel catalog-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar mensajes o contenido…"
            aria-label="Buscar mensajes"
          />
        </div>
        <select
          aria-label="Categoría de mensaje"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {[...new Set(data.templates.map((t) => t.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      {templates.length ? (
        <div className="messages-grid">
          {templates.map((t) => (
            <article className="panel message-card" key={t.id}>
              <div className="message-card-heading">
                <span className="message-category">{t.category}</span>
                <button
                  className="icon-btn ml-auto"
                  aria-label={`Editar ${t.title}`}
                  onClick={() => setEditing(t)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-btn text-danger"
                  aria-label={`Eliminar ${t.title}`}
                  onClick={() => void remove(t)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <h2>{t.title}</h2>
              <p className="message-body">{t.body}</p>
              <div className="message-card-footer">
                <Button variant="ghost" onClick={() => void copy(t)}>
                  {copied === t.id ? <Check size={15} /> : <Copy size={15} />}
                  {copied === t.id ? 'Copiado' : 'Copiar plantilla'}
                </Button>
                <Button variant="secondary" onClick={() => setSending(t)}>
                  <Send size={14} />
                  Preparar envío
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Tus respuestas, a un clic."
            description="Guardá explicaciones, confirmaciones y recordatorios. Todo el equipo podrá usarlos."
            icon={<MessagesSquare size={28} />}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  if (onRequireConnection()) setEditing('new')
                }}
              >
                <Plus size={16} />
                Crear mensaje
              </Button>
            }
          />
        </section>
      )}
      {editing ? (
        <TemplateForm
          template={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {sending ? <MessageComposer template={sending} onClose={() => setSending(null)} /> : null}
    </div>
  )
}
function TemplateForm({ template, onClose }: { template?: Template; onClose: () => void }) {
  const { workspace, refresh } = useData()
  const notify = useToast()
  const [title, setTitle] = useState(template?.title ?? '')
  const [category, setCategory] = useState(template?.category ?? 'General')
  const [body, setBody] = useState(template?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const values = { title: title.trim(), category: category.trim(), body }
      const request = template
        ? db()
            .from('message_templates')
            .update({ ...values, updated_at: new Date().toISOString() })
            .eq('id', template.id)
            .eq('version', template.version)
        : db()
            .from('message_templates')
            .insert({ ...values, workspace_id: workspace!.id })
      const { error } = await request.select().single()
      if (error) throw error
      await refresh()
      notify('Mensaje guardado para todo el equipo.')
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={template ? 'Editar mensaje' : 'Nuevo mensaje'}
      subtitle="Se conservan emojis, saltos de línea y formato de WhatsApp."
      onClose={onClose}
      busy={busy}
    >
      <form className="form-stack" onSubmit={save}>
        <Field label="Título">
          <input
            required
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Categoría">
          <input
            required
            maxLength={80}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Field>
        <Field label="Texto del mensaje">
          <textarea
            required
            maxLength={10000}
            rows={9}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="¡Hola {nombre_cliente}! 👋"
          />
        </Field>
        <div className="variable-chips">
          {['nombre_cliente', 'servicio', 'precio', 'moneda', 'fecha', 'hora'].map((v) => (
            <button
              type="button"
              key={v}
              onClick={() => setBody((b) => b + `{${v}}`)}
            >{`{${v}}`}</button>
          ))}
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            Guardar mensaje
          </Button>
        </div>
      </form>
    </Modal>
  )
}
function MessageComposer({ template, onClose }: { template: Template; onClose: () => void }) {
  const { data } = useData()
  const notify = useToast()
  const [customerId, setCustomerId] = useState('')
  const [appointmentId, setAppointmentId] = useState('')
  const customer = data.customers.find((c) => c.id === customerId)
  const appointment = data.appointments.find((a) => a.id === appointmentId)
  const values: Record<string, string> = {
    ...(customer ? { nombre_cliente: customer.full_name } : {}),
    ...(appointment
      ? {
          servicio: serviceNames(appointment.id, data.appointmentServices),
          precio: new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2 }).format(
            appointment.total_cents / 100,
          ),
          moneda: appointment.currency,
          fecha: zoned(appointment.starts_at, 'dd/MM/yyyy'),
          hora: zoned(appointment.starts_at, 'HH:mm'),
        }
      : {}),
  }
  const rendered = fillTemplate(template.body, values)
  const unresolved = /\{(nombre_cliente|servicio|precio|moneda|fecha|hora)\}/.test(rendered)
  async function copy() {
    try {
      await navigator.clipboard.writeText(rendered)
      notify('Mensaje preparado copiado.')
    } catch {
      notify('No se pudo copiar. Seleccioná el texto de la vista previa.', true)
    }
  }
  return (
    <Modal title="Preparar mensaje" subtitle={template.title} onClose={onClose}>
      <div className="form-stack">
        <Field label="Cliente">
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value)
              setAppointmentId('')
            }}
          >
            <option value="">Seleccionar cliente…</option>
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} · {c.phone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Turno para completar las variables">
          <select
            value={appointmentId}
            disabled={!customerId}
            onChange={(e) => setAppointmentId(e.target.value)}
          >
            <option value="">Sin turno seleccionado</option>
            {data.appointments
              .filter((a) => a.customer_id === customerId && !a.deleted_at)
              .toSorted((a, b) => b.starts_at.localeCompare(a.starts_at))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {zoned(a.starts_at, 'dd/MM/yyyy HH:mm')} ·{' '}
                  {serviceNames(a.id, data.appointmentServices)}
                </option>
              ))}
          </select>
        </Field>
        <div className="message-preview">
          <span>
            <MessageCircle size={16} />
            VISTA PREVIA
          </span>
          <p>{rendered}</p>
        </div>
        {unresolved ? (
          <p className="warning">
            Seleccioná un cliente y, si corresponde, un turno para completar todas las variables
            antes de enviar.
          </p>
        ) : null}
        <div className="modal-actions">
          <Button variant="secondary" onClick={() => void copy()}>
            <Copy size={15} />
            Copiar mensaje
          </Button>
          {customer && !unresolved ? (
            <a
              className="btn btn-primary"
              href={whatsappUrl(customer.phone, rendered)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} />
              Abrir WhatsApp
            </a>
          ) : (
            <Button disabled>
              <MessageCircle size={16} />
              Abrir WhatsApp
            </Button>
          )}
        </div>
        <p className="muted small">
          WhatsApp se abrirá con el texto preparado. El envío siempre lo confirmás vos.
        </p>
      </div>
    </Modal>
  )
}
