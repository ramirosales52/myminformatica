import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Clock3, Copy, Download, Monitor, UserRound, Wrench } from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { messageFor } from '../lib/supabase'
import {
  downloadFile,
  duration,
  money,
  paidFor,
  paymentState,
  shifted,
  utcOffsetLabel,
  zoned,
} from '../lib/domain'
import type { Appointment } from '../lib/types'
import { Button, Modal } from './ui'

export function Receipt({
  appointment: latestAppointment,
  onClose,
}: {
  appointment: Appointment
  onClose: () => void
}) {
  const { appointmentData: data, workspaces } = useData()
  const latestWorkspace = workspaces.find((w) => w.id === latestAppointment.workspace_id) ?? null
  const notify = useToast()
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [hasLogo, setHasLogo] = useState(true)
  // La imagen conserva la misma instantánea, incluso si otro integrante cobra mientras se genera.
  const [snapshot] = useState(() => ({
    appointment: latestAppointment,
    workspace: latestWorkspace,
    customer: data.customers.find((c) => c.id === latestAppointment.customer_id),
    paid: paidFor(latestAppointment.id, data.payments),
    lines: data.appointmentServices.filter((s) => s.appointment_id === latestAppointment.id),
    generatedAt: new Date().toISOString(),
  }))
  const { appointment, workspace, customer, paid, lines, generatedAt } = snapshot
  const subtotal = lines.reduce((sum, line) => sum + line.price_cents, 0)
  // El comprobante se lee en el país del cliente; la diferencia se carga a mano en el cliente.
  const offset = customer?.tz_offset_minutes ?? null
  const tutorialText = `¡Hola! 👋 Te compartimos el comprobante de tu turno del ${zoned(
    shifted(appointment.starts_at, offset),
    "EEEE, d 'de' MMMM 'de' yyyy 'a las' HH:mm",
  )} hs (${offset ? 'hora de tu país' : 'hora de Argentina'}).\n\n💻 Tutorial para instalar la app de conexión remota:\nhttps://drive.google.com/drive/folders/1RkQH8nKH_vJERmQ40d5jYTdgrAa4ib02\n\nCuando la tengas instalada, pasanos tu ID por este chat.\nM&M Informática`
  const stale =
    latestAppointment.version !== appointment.version ||
    latestWorkspace?.version !== workspace?.version ||
    paidFor(appointment.id, data.payments) !== paid ||
    data.customers.find((c) => c.id === appointment.customer_id)?.version !== customer?.version
  const staleRef = useRef(stale)
  useEffect(() => {
    staleRef.current = stale
  }, [stale])
  const cachedPng = useRef<Promise<string> | null>(null)
  const state = paymentState(appointment.total_cents, paid)
  const titles = {
    pending: 'Turno pendiente',
    confirmed: 'Turno confirmado',
    completed: 'Trabajo completado',
    rescheduled: 'Turno reprogramado',
    cancelled: 'Turno cancelado',
  }
  async function png() {
    if (!cachedPng.current) {
      cachedPng.current = (async () => {
        const { toPng } = await import('html-to-image')
        await document.fonts.ready
        return toPng(ref.current!, {
          pixelRatio: 2,
          backgroundColor: '#101a2c',
          preferredFontFormat: 'woff2',
        })
      })()
      void cachedPng.current.catch(() => {
        cachedPng.current = null
      })
    }
    return cachedPng.current
  }
  async function downloadPng() {
    setBusy(true)
    try {
      const image = await png()
      if (staleRef.current)
        throw new Error(
          'El turno cambió. Cerrá y volvé a abrir el comprobante para usar los datos actuales.',
        )
      const blob = await (await fetch(image)).blob()
      downloadFile(blob, `${appointment.reference}.png`)
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  async function copyTutorial() {
    setBusy(true)
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Tu navegador no permite copiar texto al portapapeles.')
      await navigator.clipboard.writeText(tutorialText)
      notify('Tutorial copiado. Ya podés pegar el mensaje con el enlace al Drive.')
    } catch (err) {
      notify(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'No se pudo copiar el tutorial. Permití el acceso al portapapeles y reintentá.'
          : messageFor(err),
        true,
      )
    } finally {
      setBusy(false)
    }
  }
  async function copyImage() {
    setBusy(true)
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
        throw new Error('Tu navegador no permite copiar imágenes. Podés descargar el PNG.')
      // Iniciar la escritura durante el clic; Safari pierde el permiso si esperamos a generar el PNG.
      const blob = png().then(async (image) => {
        const result = await (await fetch(image)).blob()
        if (staleRef.current)
          throw new Error(
            'El turno cambió. Cerrá y volvé a abrir el comprobante para usar los datos actuales.',
          )
        return result
      })
      // También manejar el rechazo si el navegador deniega la escritura antes de consumir la imagen.
      void blob.catch(() => {})
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      notify('Imagen copiada. Ya podés pegarla en WhatsApp u otra aplicación.')
    } catch (err) {
      notify(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'No se pudo copiar la imagen. Permití el acceso al portapapeles o descargá el PNG.'
          : messageFor(err),
        true,
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Comprobante del turno" onClose={onClose} busy={busy} hideTitle>
      {stale ? (
        <p className="warning">
          El turno, el cliente o sus cobros cambiaron. Cerrá y volvé a abrir este comprobante para
          generar una versión actualizada.
        </p>
      ) : null}
      <div className="receipt-scroll">
        <div ref={ref} className="receipt">
          <div className="receipt-brand">
            <span className="brand-mark">
              {hasLogo ? (
                <img
                  src={`${import.meta.env.BASE_URL}branding/logo.png`}
                  alt="Logo de M&M Informatica"
                  onError={() => setHasLogo(false)}
                />
              ) : (
                <Monitor size={22} />
              )}
            </span>
            <div>
              <strong>M&M Informatica</strong>
              <span>ATENCIÓN REMOTA · ARGENTINA</span>
            </div>
          </div>
          <div className="receipt-status">
            <h2>Comprobante de turno</h2>
            <span className={`badge status-${appointment.status}`}>
              <i aria-hidden="true" />
              {titles[appointment.status]}
            </span>
          </div>
          <div className="receipt-customer receipt-detail">
            <UserRound size={18} aria-hidden="true" />
            <div>
              <small>Cliente</small>
              <h3>{customer?.full_name}</h3>
            </div>
          </div>
          <div className="receipt-schedule">
            <div>
              <small>
                <CalendarDays size={15} />
                {offset ? 'Fecha en tu país' : 'Fecha del turno'}
              </small>
              <strong>{zoned(shifted(appointment.starts_at, offset), 'dd/MM/yyyy')}</strong>
            </div>
            <div>
              <small>
                <Clock3 size={15} />
                {offset ? 'Horario en tu país' : 'Horario'}
              </small>
              <strong>{zoned(shifted(appointment.starts_at, offset), 'HH:mm')} h</strong>
              <span className="receipt-timezone">
                {offset ? `Tu horario (${utcOffsetLabel(offset)})` : 'Hora de Argentina (UTC−3)'}
              </span>
            </div>
          </div>
          <div className="receipt-services">
            <div className="receipt-detail">
              <Wrench size={18} aria-hidden="true" />
              <div>
                <small>Servicios</small>
                <ul>
                  {lines.map((l, i) => (
                    <li key={i}>{l.name}</li>
                  ))}
                </ul>
                <p className="receipt-modality">
                  Remoto · {duration(appointment.duration_minutes)}
                </p>
              </div>
            </div>
          </div>
          <div className="receipt-totals">
            <div className="receipt-payment-heading">
              <small>Resumen de pago</small>
              <span className={`payment-pill ${state}`}>
                {state === 'paid'
                  ? 'Pago completo'
                  : state === 'partial'
                    ? 'Pago parcial'
                    : 'Pago pendiente'}
              </span>
            </div>
            {subtotal > appointment.total_cents ? (
              <>
                <p>
                  <span>Suma de servicios</span>
                  <strong>{money(subtotal, appointment.currency)}</strong>
                </p>
                <p>
                  <span>Descuento acordado</span>
                  <strong>{money(subtotal - appointment.total_cents, appointment.currency)}</strong>
                </p>
              </>
            ) : null}
            <p>
              <span>Importe total</span>
              <strong>{money(appointment.total_cents, appointment.currency)}</strong>
            </p>
            <p>
              <span>Monto abonado</span>
              <strong className="text-green">{money(paid, appointment.currency)}</strong>
            </p>
            <p className={`receipt-balance ${state}`}>
              <span>Saldo pendiente</span>
              <strong>
                {money(Math.max(0, appointment.total_cents - paid), appointment.currency)}
              </strong>
            </p>
          </div>
          <div className="receipt-footer">
            <p className="receipt-reference">
              Referencia: <strong>{appointment.reference}</strong>
            </p>
            <p>Emitido: {zoned(generatedAt, 'dd/MM/yyyy HH:mm')}</p>
            {workspace?.business_phone || workspace?.business_email ? (
              <p>
                {[workspace.business_phone, workspace.business_email].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="quick-amounts mt-5">
        <Button onClick={() => void copyImage()} loading={busy} disabled={stale}>
          <Copy size={16} />
          Copiar imagen
        </Button>
        <Button
          variant="secondary"
          onClick={() => void copyTutorial()}
          loading={busy}
          disabled={stale}
        >
          <Copy size={16} />
          Copiar tutorial
        </Button>
        <Button
          variant="secondary"
          onClick={() => void downloadPng()}
          loading={busy}
          disabled={stale}
        >
          <Download size={16} />
          Descargar PNG
        </Button>
      </div>
    </Modal>
  )
}
