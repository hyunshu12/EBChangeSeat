import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeatMap } from '@/components/SeatMap'
import type { Arrangement, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${String(i + 1).padStart(2, '0')}`,
}))

describe('SeatMap', () => {
  it('교탁과 27개 좌석을 렌더링', () => {
    render(<SeatMap students={students} arrangement={null} />)
    expect(screen.getByText('교탁')).toBeInTheDocument()
    expect(screen.getAllByTestId('seat')).toHaveLength(27)
  })
  it('배치가 있으면 좌석에 학생 이름 표시', () => {
    const arrangement: Arrangement = { '2501': '1-1-L' }
    render(<SeatMap students={students} arrangement={arrangement} />)
    expect(screen.getByText('학생01')).toBeInTheDocument()
  })
  it('고정석 학생에게 고정 배지 표시', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '1-1-L' } : s))
    render(<SeatMap students={withFixed} arrangement={{ '2501': '1-1-L' }} />)
    expect(screen.getByText('고정')).toBeInTheDocument()
  })
  it('확률 행이 주어지면 퍼센트 표시', () => {
    render(<SeatMap students={students} arrangement={null} probRow={{ '1-1-L': 0.0512 }} selectedStudentId="2501" />)
    expect(screen.getByText('5.1%')).toBeInTheDocument()
  })
})
