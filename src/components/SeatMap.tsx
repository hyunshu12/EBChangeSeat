'use client'

import { SEATS } from '@/lib/seats'
import type { Arrangement, Student } from '@/lib/types'

interface Props {
  students: Student[]
  arrangement: Arrangement | null
  probRow?: Record<string, number> | null
  selectedStudentId?: string | null
  swapPicks?: string[]
  revealKey?: number
  onSeatClick?: (seatId: string, occupantId: string | null) => void
}

export function SeatMap({
  students, arrangement, probRow, selectedStudentId, swapPicks = [], revealKey = 0, onSeatClick,
}: Props) {
  const byId = new Map(students.map(s => [s.id, s]))
  const seatToStudent = new Map<string, string>()
  if (arrangement) for (const [sid, seat] of Object.entries(arrangement)) seatToStudent.set(seat, sid)
  const maxProb = probRow ? Math.max(...Object.values(probRow), 1e-9) : 1

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-4">
        <div className="mx-auto w-44 rounded border-2 border-gray-500 py-2 text-center text-sm font-bold dark:border-gray-300">
          교탁
        </div>
        <div className="flex justify-center gap-8">
          {([1, 2, 3] as const).map(block => (
            <div key={block} className="grid grid-cols-2 gap-2">
              {SEATS.filter(s => s.block === block).map(seat => {
                const occupantId = seatToStudent.get(seat.id) ?? null
                const occupant = occupantId ? byId.get(occupantId) : null
                const prob = probRow?.[seat.id]
                const isSelected = !!occupantId && occupantId === selectedStudentId
                const isPicked = !!occupantId && swapPicks.includes(occupantId)
                return (
                  <button
                    key={`${seat.id}-${revealKey}`}
                    type="button"
                    data-testid="seat"
                    onClick={() => onSeatClick?.(seat.id, occupantId)}
                    style={{
                      gridColumnStart: seat.col === 'L' ? 1 : 2,
                      gridRowStart: seat.row,
                      backgroundColor: prob !== undefined
                        ? `rgba(59, 130, 246, ${(prob / maxProb) * 0.75})`
                        : undefined,
                      animationDelay: `${(seat.row * 3 + seat.block) * 60}ms`,
                    }}
                    className={`h-16 w-24 rounded border p-1 text-center text-xs transition
                      ${isSelected ? 'ring-2 ring-blue-500' : ''}
                      ${isPicked ? 'ring-2 ring-amber-500' : ''}
                      ${revealKey > 0 ? 'animate-[seat-reveal_.4s_ease-out_both]' : ''}
                      border-gray-300 dark:border-gray-600`}
                  >
                    {occupant ? (
                      <span className="block">
                        <span className="block truncate font-semibold">{occupant.name}</span>
                        <span className="block text-[10px] opacity-60">{occupant.id}</span>
                        {occupant.fixedSeatId === seat.id && (
                          <span className="rounded bg-amber-200 px-1 text-[10px] text-amber-900">고정</span>
                        )}
                      </span>
                    ) : (
                      <span className="opacity-40">{seat.id}</span>
                    )}
                    {prob !== undefined && (
                      <span className="block text-[10px] font-bold">{(prob * 100).toFixed(1)}%</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
