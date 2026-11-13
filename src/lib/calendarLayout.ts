import { endTime, shiftDay, toUTC } from './domain'
import type { ScheduledAppointment } from './types'

export interface CalendarSegment {
  appointment: ScheduledAppointment
  start: number
  end: number
  lane: number
  lanes: number
}

// Clip to the visible day, including appointments that continue past midnight.
export function daySegments(appointments: ScheduledAppointment[], day: string): CalendarSegment[] {
  const start = new Date(toUTC(`${day}T00:00`)).getTime()
  const end = new Date(toUTC(`${shiftDay(day, 1)}T00:00`)).getTime()
  return appointments
    .flatMap((appointment) => {
      const from = Math.max(start, new Date(appointment.starts_at).getTime())
      const to = Math.min(end, endTime(appointment).getTime())
      return from < to
        ? [
            {
              appointment,
              start: (from - start) / 60000,
              end: (to - start) / 60000,
              lane: 0,
              lanes: 1,
            },
          ]
        : []
    })
    .toSorted((a, b) => a.start - b.start || b.end - a.end)
}

// Each connected group of overlapping appointments shares the available width.
export function layoutSegments(segments: CalendarSegment[]): CalendarSegment[] {
  const result: CalendarSegment[] = []
  let group: CalendarSegment[] = []
  let groupEnd = -1
  function flush() {
    const ends: number[] = []
    for (const segment of group) {
      let lane = ends.findIndex((end) => end <= segment.start)
      if (lane === -1) lane = ends.length
      ends[lane] = segment.end
      segment.lane = lane
    }
    result.push(...group.map((segment) => ({ ...segment, lanes: ends.length })))
  }
  for (const segment of segments.toSorted((a, b) => a.start - b.start || b.end - a.end)) {
    if (segment.start >= groupEnd) {
      flush()
      group = []
    }
    group.push({ ...segment })
    groupEnd = Math.max(segment.end, group.length === 1 ? -1 : groupEnd)
  }
  flush()
  return result
}

export function calendarHours(segments: CalendarSegment[]) {
  const start = Math.min(8, ...segments.map((segment) => Math.floor(segment.start / 60)))
  const end = Math.max(20, ...segments.map((segment) => Math.ceil(segment.end / 60)))
  return Array.from({ length: end - start }, (_, index) => start + index)
}
