import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwapControls } from '@/components/SwapControls'

afterEach(() => vi.restoreAllMocks())

const picks = [
  { id: '2501', name: '학생01' },
  { id: '2502', name: '학생02' },
]

describe('SwapControls', () => {
  it('두 명 선택 + 이름/PIN 입력 → swap API 호출 → onResult', async () => {
    const arrangement = { '2501': '1-1-R', '2502': '1-1-L' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ arrangement }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const onResult = vi.fn()
    render(<SwapControls picks={picks} onResult={onResult} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '4321')
    await userEvent.click(screen.getByRole('button', { name: /교환 실행/ }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(arrangement))
    expect(fetchMock).toHaveBeenCalledWith('/api/swap', expect.objectContaining({ method: 'POST' }))
  })
  it('선택이 2명 미만이면 실행 버튼 비활성', () => {
    render(<SwapControls picks={[picks[0]]} onResult={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /교환 실행/ })).toBeDisabled()
  })
  it('401 → PIN 오류 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'wrong_pin' }), { status: 401 }),
    ))
    render(<SwapControls picks={picks} onResult={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '9999')
    await userEvent.click(screen.getByRole('button', { name: /교환 실행/ }))
    expect(await screen.findByText('PIN이 올바르지 않습니다')).toBeInTheDocument()
  })
})
