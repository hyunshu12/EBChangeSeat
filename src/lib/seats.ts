import type { Seat, SeatId } from './types'

function fullRows(block: 1 | 2 | 3, rowCount: number): Seat[] {
  const out: Seat[] = []
  for (let row = 1; row <= rowCount; row++) {
    for (const col of ['L', 'R'] as const) {
      out.push({ id: `${block}-${row}-${col}`, block, row, col })
    }
  }
  return out
}

/** 교실 좌석 27석. row 1이 교탁(앞) 쪽. 3분단은 4행 왼쪽 1석으로 끝남. */
export const SEATS: Seat[] = [
  ...fullRows(1, 5),
  ...fullRows(2, 5),
  ...fullRows(3, 3),
  { id: '3-4-L', block: 3, row: 4, col: 'L' },
]

export const SEAT_IDS: SeatId[] = SEATS.map(s => s.id)
