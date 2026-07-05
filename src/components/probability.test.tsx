import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClassroomView } from '@/components/ClassroomView'
import { SEAT_IDS } from '@/lib/seats'
import type { Student } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
afterEach(() => vi.restoreAllMocks())

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${String(i + 1).padStart(2, '0')}`,
}))
const arrangement = Object.fromEntries(students.map((s, i) => [s.id, SEAT_IDS[i]]))

function mockProbabilities() {
  const row = Object.fromEntries(SEAT_IDS.map(id => [id, 1 / 27]))
  const probabilities = Object.fromEntries(students.map(s => [s.id, row]))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ probabilities }), { status: 200 }),
  ))
}

describe('확률 오버레이', () => {
  it('좌석 클릭 → 확률 API 호출 → 퍼센트 표시', async () => {
    mockProbabilities()
    render(<ClassroomView students={students} initialArrangement={arrangement} latestInfo={null} />)
    await userEvent.click(screen.getByText('학생01'))
    expect(await screen.findAllByText('3.7%')).not.toHaveLength(0)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/probabilities?avoidPrev='))
  })
  it('같은 학생 재클릭 → 오버레이 해제', async () => {
    mockProbabilities()
    render(<ClassroomView students={students} initialArrangement={arrangement} latestInfo={null} />)
    await userEvent.click(screen.getByText('학생01'))
    await screen.findAllByText('3.7%')
    await userEvent.click(screen.getByText('학생01'))
    expect(screen.queryByText('3.7%')).not.toBeInTheDocument()
  })
  it('배치가 없으면 학생 칩 목록으로 선택 가능', async () => {
    mockProbabilities()
    render(<ClassroomView students={students} initialArrangement={null} latestInfo={null} />)
    await userEvent.click(screen.getByRole('button', { name: '학생05' }))
    expect(await screen.findAllByText('3.7%')).not.toHaveLength(0)
  })
})
