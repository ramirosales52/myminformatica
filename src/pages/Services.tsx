import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Clock3,
  FileText,
  Monitor,
  Package,
  Palette,
  Pencil,
  Plus,
  Search,
  Settings2,
  Video,
  WandSparkles,
  Zap,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor } from '../lib/supabase'
import { duration, money, toCents } from '../lib/domain'
import type { Service } from '../lib/types'
import { Button, Empty, Field, Modal, PageHeading } from '../components/ui'

function serviceIcon(name: string) {
  if (name.includes('Adobe') || name.includes('Corel')) return Palette
  if (name.includes('CapCut')) return Video
  if (name.includes('Office')) return FileText
  if (name.includes('Optimización')) return Zap
  if (name.includes('Sketch')) return WandSparkles
  return Monitor
}
export function Services({
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
  const [active, setActive] = useState('all')
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [busyId, setBusyId] = useState('')
  const services = data.services
    .filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) &&
        (category === 'all' || s.category === category) &&
        (active === 'all' || s.active === (active === 'active')),
    )
    .toSorted((a, b) => a.name.localeCompare(b.name))
  async function toggle(s: Service) {
    setBusyId(s.id)
    try {
      const { error } = await db()
        .from('services')
        .update({ active: !s.active })
        .eq('id', s.id)
        .eq('version', s.version)
        .select()
        .single()
      if (error) throw error
      await refresh()
      notify(
        s.active ? 'Servicio desactivado. Los turnos anteriores no cambian.' : 'Servicio activado.',
      )
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusyId('')
    }
  }
  return (
    <div className="page">
      <PageHeading
        title="Servicios"
        action={
          <Button
            onClick={() => {
              if (onRequireConnection()) setEditing('new')
            }}
          >
            <Plus size={17} />
            Nuevo servicio
          </Button>
        }
      />
      <div className="catalog-summary">
        <span>
          <Package size={19} />
          <strong>{data.services.filter((s) => s.active).length}</strong> servicios activos
        </span>
        <span>
          <Settings2 size={15} />
          Los cambios no modifican turnos ya agendados
        </span>
      </div>
      <div className="panel catalog-toolbar">
        <div className="search-input">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar un servicio…"
            aria-label="Buscar servicios"
          />
        </div>
        <select
          aria-label="Categoría de servicio"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">Todas las categorías</option>
          {[...new Set(data.services.map((s) => s.category))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Estado del servicio"
          value={active}
          onChange={(e) => setActive(e.target.value)}
        >
          <option value="all">Todos los servicios</option>
          <option value="active">Solo activos</option>
          <option value="inactive">Solo inactivos</option>
        </select>
      </div>
      {services.length ? (
        <div className="services-grid">
          {services.map((s, i) => {
            const Icon = serviceIcon(s.name)
            return (
              <article className={`panel service-card ${!s.active ? 'inactive' : ''}`} key={s.id}>
                <div className="service-card-top">
                  <span className={`service-card-icon icon-tone-${i % 4}`}>
                    <Icon size={24} />
                  </span>
                  <span className={`availability ${s.active ? 'active' : ''}`}>
                    <i />
                    {s.active ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    className="icon-btn ml-auto"
                    onClick={() => setEditing(s)}
                    aria-label={`Editar ${s.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <span className="service-category">{s.category}</span>
                <h2>{s.name}</h2>
                {s.description ? <p>{s.description}</p> : null}
                <div className="service-duration">
                  <Clock3 size={15} />
                  {duration(s.duration_minutes)} estimados
                </div>
                <div className="service-prices">
                  <div>
                    <small>PESOS ARGENTINOS</small>
                    <strong>{money(s.price_ars, 'ARS')}</strong>
                  </div>
                  <div>
                    <small>DÓLARES</small>
                    <strong>{money(s.price_usd, 'USD')}</strong>
                  </div>
                </div>
                <div className="service-card-footer">
                  {!s.price_ars && !s.price_usd ? (
                    <span className="text-orange">Configurar precios</span>
                  ) : (
                    <span>Precio por servicio</span>
                  )}
                  <button
                    className="text-link"
                    disabled={busyId === s.id}
                    onClick={() => void toggle(s)}
                  >
                    {busyId === s.id ? 'Guardando…' : s.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title={search ? 'Sin resultados' : 'No hay servicios'}
            description={search ? 'Probá con otro nombre.' : undefined}
            icon={<Package size={29} />}
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  if (onRequireConnection()) setEditing('new')
                }}
              >
                <Plus size={16} />
                Crear servicio
              </Button>
            }
          />
        </section>
      )}
      {editing ? (
        <ServiceForm
          service={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
function ServiceForm({ service, onClose }: { service?: Service; onClose: () => void }) {
  const { workspace, refresh } = useData()
  const notify = useToast()
  const [name, setName] = useState(service?.name ?? '')
  const [description, setDescription] = useState(service?.description ?? '')
  const [category, setCategory] = useState(service?.category ?? 'Servicio remoto')
  const [minutes, setMinutes] = useState(service?.duration_minutes ?? 60)
  const [ars, setArs] = useState(String((service?.price_ars ?? 0) / 100))
  const [usd, setUsd] = useState(String((service?.price_usd ?? 0) / 100))
  const [active, setActive] = useState(service?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const values = {
        name: name.trim(),
        description,
        category: category.trim(),
        duration_minutes: minutes,
        price_ars: toCents(ars),
        price_usd: toCents(usd),
        active,
      }
      const request = service
        ? db().from('services').update(values).eq('id', service.id).eq('version', service.version)
        : db()
            .from('services')
            .insert({ ...values, workspace_id: workspace!.id })
      const { error } = await request.select().single()
      if (error) throw error
      await refresh()
      notify('Servicio guardado. Los acuerdos anteriores conservan su precio y duración.')
      onClose()
    } catch (err) {
      setError(messageFor(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={service ? 'Editar servicio' : 'Nuevo servicio'} onClose={onClose} busy={busy}>
      <form className="form-stack" onSubmit={save}>
        <Field label="Nombre del servicio">
          <input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Descripción">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="form-grid">
          <Field label="Categoría">
            <input
              required
              maxLength={80}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
          <Field label="Duración estimada (minutos)">
            <input
              required
              type="number"
              min={5}
              max={10080}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Precio en pesos (ARS)">
            <input
              required
              type="number"
              step="0.01"
              min={0}
              value={ars}
              onChange={(e) => setArs(e.target.value)}
            />
          </Field>
          <Field label="Precio en dólares (USD)">
            <input
              required
              type="number"
              step="0.01"
              min={0}
              value={usd}
              onChange={(e) => setUsd(e.target.value)}
            />
          </Field>
        </div>
        <label className="checkbox-line">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Disponible para nuevos turnos
        </label>
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
            Guardar servicio
          </Button>
        </div>
      </form>
    </Modal>
  )
}
