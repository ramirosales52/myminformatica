import { useEffect, useRef, useState } from 'react'
import {
  CalendarDays,
  Check,
  Download,
  FileText,
  Link2,
  LockKeyhole,
  MessageCircle,
  Monitor,
  ReceiptText,
} from 'lucide-react'
import { useData } from '../providers/DataProvider'
import { useToast } from '../providers/ToastProvider'
import { db, messageFor } from '../lib/supabase'
import {
  customerSchedule,
  downloadFile,
  duration,
  money,
  paidFor,
  PAYMENT_STATUS,
  paymentState,
  shifted,
  utcOffsetLabel,
  whatsappUrl,
  zoned,
} from '../lib/domain'
import { STATUS } from '../lib/types'
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
  const [link, setLink] = useState('')
  const [sharePath, setSharePath] = useState('')
  const [consent, setConsent] = useState(false)
  // Una imagen y su mensaje deben describir la misma instantánea, incluso si otro integrante cobra mientras se genera.
  const [snapshot] = useState(() => ({
    appointment: latestAppointment,
    workspace: latestWorkspace,
    customer: data.customers.find((c) => c.id === latestAppointment.customer_id),
    paid: paidFor(latestAppointment.id, data.payments),
    lines: data.appointmentServices.filter((s) => s.appointment_id === latestAppointment.id),
    generatedAt: new Date().toISOString(),
  }))
  const { appointment, workspace, customer, paid, lines, generatedAt } = snapshot
  // El comprobante se lee en el país del cliente; la diferencia se carga a mano en el cliente.
  const offset = customer?.tz_offset_minutes ?? null
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
  async function generate(format: 'png' | 'pdf' | 'share') {
    setBusy(true)
    try {
      const image = await png()
      if (staleRef.current)
        throw new Error(
          'El turno cambió. Cerrá y volvé a abrir el comprobante para usar los datos actuales.',
        )
      const blob = await (await fetch(image)).blob()
      if (format === 'png') downloadFile(blob, `${appointment.reference}.png`)
      else if (format === 'pdf') {
        const { jsPDF } = await import('jspdf')
        const height = ref.current!.offsetHeight * (190 / ref.current!.offsetWidth)
        const pdf = new jsPDF({ unit: 'mm', format: [210, Math.max(297, height + 20)] })
        pdf.setFillColor('#080e1b')
        pdf.rect(0, 0, 210, Math.max(297, height + 20), 'F')
        pdf.addImage(image, 'PNG', 10, 10, 190, height)
        pdf.save(`${appointment.reference}.pdf`)
      } else {
        if (!customer?.phone)
          throw new Error('Agregá un teléfono al cliente para compartir por WhatsApp.')
        if (!workspace || !customer || !consent)
          throw new Error(
            'Confirmá que querés compartir este comprobante mediante un enlace temporal.',
          )
        const path = `${workspace.id}/${appointment.id}/${crypto.randomUUID()}.png`
        const uploaded = await db()
          .storage.from('receipts')
          .upload(path, blob, { contentType: 'image/png', upsert: false, cacheControl: '0' })
        if (uploaded.error) throw uploaded.error
        const signed = await db().storage.from('receipts').createSignedUrl(path, 3600)
        if (signed.error) throw signed.error
        setSharePath(path)
        setLink(
          whatsappUrl(
            customer.phone,
            `¡Hola ${customer.full_name}! 👋\n${titles[appointment.status]}\n📅 ${customerSchedule(appointment.starts_at, customer.tz_offset_minutes)}\n${lines.map((l) => l.name).join(' + ')}\nTotal: ${money(appointment.total_cents, appointment.currency)}\nAbonado: ${money(paid, appointment.currency)}\nSaldo: ${money(Math.max(0, appointment.total_cents - paid), appointment.currency)}\n\nTu comprobante (enlace válido por 1 hora):\n${signed.data.signedUrl}`,
          ),
        )
        notify('Enlace temporal listo. Abrí WhatsApp para confirmar el envío.')
      }
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  async function revoke() {
    setBusy(true)
    try {
      const { error } = await db().storage.from('receipts').remove([sharePath])
      if (error) throw error
      setLink('')
      setSharePath('')
      notify(
        'Archivo compartido eliminado. La revocación puede tardar hasta un minuto en propagarse; no elimina copias ya descargadas.',
      )
    } catch (err) {
      notify(messageFor(err), true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Comprobante del turno"
      subtitle="Una copia clara del trabajo y de su situación de pago."
      onClose={onClose}
      busy={busy}
    >
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
              <Monitor size={22} />
            </span>
            <div>
              <strong>{workspace?.business_name || 'Servicio técnico remoto'}</strong>
              <span>ATENCIÓN REMOTA · ARGENTINA</span>
            </div>
          </div>
          <div className={`receipt-status status-${appointment.status}`}>
            <span className="receipt-check">
              {appointment.status === 'cancelled' ? (
                <CalendarDays size={28} />
              ) : (
                <Check size={30} />
              )}
            </span>
            <h2>{titles[appointment.status]}</h2>
            <p>{appointment.reference}</p>
          </div>
          <div className="receipt-customer">
            <small>PREPARADO PARA</small>
            <h3>{customer?.full_name}</h3>
          </div>
          <div className="receipt-grid">
            <div>
              <small>{offset ? 'Fecha en tu país' : 'Fecha'}</small>
              <strong>{zoned(shifted(appointment.starts_at, offset), 'dd/MM/yyyy')}</strong>
            </div>
            <div>
              <small>{offset ? 'Horario en tu país' : 'Horario'}</small>
              <strong>{zoned(shifted(appointment.starts_at, offset), 'HH:mm')} h</strong>
            </div>
            <div>
              <small>Modalidad</small>
              <strong>Remota</strong>
            </div>
            <div>
              <small>Duración</small>
              <strong>{duration(appointment.duration_minutes)}</strong>
            </div>
          </div>
          {offset ? (
            <p className="receipt-zone-note">
              Argentina: {zoned(appointment.starts_at, 'dd/MM/yyyy HH:mm')} h (UTC−3) · Tu horario:{' '}
              {utcOffsetLabel(offset)}
            </p>
          ) : null}
          <div className="receipt-services">
            <small>SERVICIOS ACORDADOS</small>
            {lines.map((l, i) => (
              <p key={i}>
                <ReceiptText size={15} />
                {l.name}
              </p>
            ))}
          </div>
          <div className="receipt-totals">
            <p>
              <span>Importe total</span>
              <strong>{money(appointment.total_cents, appointment.currency)}</strong>
            </p>
            <p>
              <span>Monto abonado</span>
              <strong className="text-green">{money(paid, appointment.currency)}</strong>
            </p>
            <p className="receipt-balance">
              <span>Saldo pendiente</span>
              <strong>
                {money(Math.max(0, appointment.total_cents - paid), appointment.currency)}
              </strong>
            </p>
          </div>
          <div className="receipt-footer">
            <p>Datos al {zoned(generatedAt, 'dd/MM/yyyy HH:mm')} (Argentina)</p>
            <span>
              {STATUS[appointment.status]} · {PAYMENT_STATUS[state]}
            </span>
            <p>
              {offset
                ? `Tu horario: ${utcOffsetLabel(offset)} · Argentina: UTC−3`
                : 'Zona horaria: Argentina (UTC−3)'}
            </p>
            <p>Comprobante de coordinación y pago. No es una factura fiscal.</p>
            {workspace?.business_phone || workspace?.business_email ? (
              <p>
                {[workspace.business_phone, workspace.business_email].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="quick-amounts mt-5">
        <Button
          variant="secondary"
          onClick={() => void generate('png')}
          loading={busy}
          disabled={stale}
        >
          <Download size={16} />
          Descargar PNG
        </Button>
        <Button
          variant="secondary"
          onClick={() => void generate('pdf')}
          loading={busy}
          disabled={stale}
        >
          <FileText size={16} />
          Descargar PDF
        </Button>
      </div>
      <div className="share-receipt">
        <p>
          <LockKeyhole size={15} />
          Enlace privado firmado · vence en 1 hora
        </p>
        <label className="checkbox-line">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Autorizo crear un enlace temporal. Quien lo reciba podrá ver este comprobante durante una
          hora.
        </label>
        {link ? (
          <>
            {!stale ? (
              <a
                className="btn btn-primary full"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={17} />
                Abrir WhatsApp y confirmar envío
              </a>
            ) : null}
            <Button className="full" variant="ghost" onClick={() => void revoke()} loading={busy}>
              Revocar enlace compartido
            </Button>
          </>
        ) : (
          <Button
            className="full"
            onClick={() => void generate('share')}
            loading={busy}
            disabled={!consent || stale || !customer?.phone}
          >
            <Link2 size={16} />
            Preparar comprobante para WhatsApp
          </Button>
        )}
        <small>
          {customer?.phone
            ? 'No se envían mensajes automáticamente.'
            : 'Sin teléfono: podés descargar el comprobante en PNG o PDF.'}
        </small>
      </div>
    </Modal>
  )
}
