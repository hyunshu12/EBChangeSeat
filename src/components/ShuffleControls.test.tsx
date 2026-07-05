import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShuffleControls } from '@/components/ShuffleControls'

afterEach(() => vi.restoreAllMocks())

function setup(onResult = vi.fn()) {
  render(<ShuffleControls avoidPrev={false} onAvoidPrevChange={vi.fn()} onResult={onResult} />)
  return onResult
}

describe('ShuffleControls', () => {
  it('이름과 PIN을 입력해 실행하면 응답 배치를 onResult로 전달', async () => {
    const arrangement = { '2501': '1-1-L' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ arrangement, seed: 'x', redrawCount: 0 }), { status: 200 }),
    ))
    const onResult = setup()
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '4321')
    await userEvent.click(screen.getByRole('button', { name: /전체 자리 배정 실행/ }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(arrangement))
  })
  it('401 → PIN 오류 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'wrong_pin' }), { status: 401 }),
    ))
    setup()
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '9999')
    await userEvent.click(screen.getByRole('button', { name: /전체 자리 배정 실행/ }))
    expect(await screen.findByText('PIN이 올바르지 않습니다')).toBeInTheDocument()
  })
  it('429 → 시도 초과 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
    ))
    setup()
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '4321')
    await userEvent.click(screen.getByRole('button', { name: /전체 자리 배정 실행/ }))
    expect(await screen.findByText(/시도 횟수를 초과/)).toBeInTheDocument()
  })
  it('이름이 비어있으면 실행 버튼 비활성', async () => {
    setup()
    expect(screen.getByRole('button', { name: /전체 자리 배정 실행/ })).toBeDisabled()
  })
})
