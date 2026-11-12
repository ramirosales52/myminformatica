import { useId, useState } from 'react'
import type { Customer } from '../lib/types'

export function CustomerPicker({
  customers,
  value,
  onChange,
  onCreate,
}: {
  customers: Customer[]
  value: string
  onChange: (id: string) => void
  onCreate: (name: string) => void
}) {
  const id = useId()
  const [query, setQuery] = useState(() => customers.find((c) => c.id === value)?.full_name ?? '')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const needle = value ? '' : query.trim().toLowerCase()
  const matches = customers
    .filter((c) => `${c.full_name} ${c.phone}`.toLowerCase().includes(needle))
    .slice(0, 8)
  const canCreate = query.trim().length > 0 && !value
  const count = matches.length + (canCreate ? 1 : 0)
  const index = Math.min(active, Math.max(0, count - 1))
  function choose(n: number) {
    if (n === matches.length && canCreate) {
      onCreate(query.trim())
      return
    }
    const customer = matches[n]
    if (!customer) return
    onChange(customer.id)
    setQuery(customer.full_name)
    setOpen(false)
  }
  return (
    <div
      className="customer-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <label className="field" htmlFor={id}>
        <span>Cliente registrado</span>
      </label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && count ? `${id}-option-${index}` : undefined}
        autoComplete="off"
        required
        value={query}
        placeholder="Buscar por nombre o teléfono…"
        onFocus={() => {
          setOpen(true)
          setActive(0)
        }}
        onChange={(e) => {
          setQuery(e.target.value)
          onChange('')
          setOpen(true)
          setActive(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
            setActive(
              (n) =>
                (n + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(1, count)) % Math.max(1, count),
            )
          }
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }
          if (e.key === 'Enter' && open) {
            e.preventDefault()
            choose(index)
          }
        }}
      />
      {open ? (
        <div
          className="customer-picker-options"
          role="listbox"
          id={`${id}-options`}
          aria-label="Clientes encontrados"
        >
          {matches.map((c, n) => (
            <button
              type="button"
              role="option"
              id={`${id}-option-${n}`}
              key={c.id}
              aria-selected={index === n}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(n)}
            >
              <strong>{c.full_name}</strong>
              <small>{c.phone || 'Sin teléfono'}</small>
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              role="option"
              id={`${id}-option-${matches.length}`}
              aria-selected={index === matches.length}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(matches.length)}
            >
              Crear «{query.trim()}»
            </button>
          ) : null}
          {!count ? (
            <p className="muted small">No hay clientes registrados. Usá Nuevo cliente.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
