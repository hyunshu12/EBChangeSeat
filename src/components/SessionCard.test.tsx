import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SessionCard } from '@/components/SessionCard'
import type { SessionDetail } from '@/lib/db'
import type { Student } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const students: Student[] = [
  { id: '2501', name: '학생01' },
  { id: '2502', name: '학생02' },
]
const session: SessionDetail = {
  id: 'sess-1',
  created_at: '2026-07-05T11:00:00Z',
  type: 'shuffle',
  invalidated: false,
  executed_by: '김철수',
  avoid_prev: true,
  seed: 'abc123',
  redraw_count: 1,
  prob_snapshot: { '2501': { '1-1-L': 0.041 } },
  assignments: [
    { session_id: 'sess-1', student_id: '2501', seat_id: '1-1-L' },
    { session_id: 'sess-1', student_id: '2502', seat_id: '1-1-R' },
  ],
}

describe('SessionCard', () => {
  it('실행자·시드·재추첨 횟수·사전 확률을 표시', async () => {
    render(<SessionCard session={session} students={students} />)
    expect(screen.getByText(/김철수/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /상세/ }))
    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.getByText(/재추첨 1회/)).toBeInTheDocument()
    expect(screen.getByText('4.1%')).toBeInTheDocument()
  })
  it('무효 세션은 무효 배지 표시', () => {
    render(<SessionCard session={{ ...session, invalidated: true }} students={students} />)
    expect(screen.getByText('무효')).toBeInTheDocument()
  })
})
