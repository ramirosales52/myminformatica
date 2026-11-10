import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { ArrowUpRight, CalendarDays, LoaderCircle, X } from 'lucide-react'
import { STATUS } from '../lib/types'
import type { Status } from '../lib/types'

export function Button({
  children,
  variant = 'primary',
  loading = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
}) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? <LoaderCircle className="spin" size={17} /> : null}
      {children}
    </button>
  )
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
  busy?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const controls = useRef({ onClose, busy })
  useEffect(() => {
    controls.current = { onClose, busy }
  }, [onClose, busy])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !controls.current.busy) controls.current.onClose()
      if (event.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        )
        if (!nodes?.length) {
          event.preventDefault()
          return
        }
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === ref.current)
        ) {
          event.preventDefault()
          last.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === ref.current)
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [])
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar ventana"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
export function Field({
  label,
  children,
  hint,
  className = '',
}: {
  label: string
  children: ReactNode
  hint?: string
  className?: string
}) {
  const id = useId()
  const control =
    isValidElement(children) &&
    typeof children.type === 'string' &&
    ['input', 'select', 'textarea'].includes(children.type)
      ? cloneElement(
          children as ReactElement<{ 'aria-labelledby'?: string; 'aria-describedby'?: string }>,
          { 'aria-labelledby': id, 'aria-describedby': hint ? `${id}-hint` : undefined },
        )
      : children
  return (
    <label className={`field ${className}`}>
      <span id={id}>{label}</span>
      {control}
      {hint ? <small id={`${id}-hint`}>{hint}</small> : null}
    </label>
  )
}
export function Empty({
  title,
  description,
  action,
  compact = false,
  icon = <CalendarDays size={26} />,
}: {
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
  icon?: ReactNode
}) {
  return (
    <div className={`empty ${compact ? 'empty-compact' : ''}`}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  )
}
export function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge status-${status}`}>
      <i />
      {STATUS[status]}
    </span>
  )
}
export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {action}
    </div>
  )
}
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  )
}
