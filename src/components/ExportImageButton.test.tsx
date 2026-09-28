import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/seatChart', () => ({ renderSeatChartPng: vi.fn().mockResolvedValue('data:image/png;base64,x') }))

import { renderSeatChartPng } from '@/lib/seatChart'
import { ExportImageButton } from '@/components/ExportImageButton'
import type { Arrangement, Student } from '@/lib/types'

const students: Student[] = [{ id: '2101', name: '김근우' }]
const arrangement: Arrangement = { '2101': '3-2-R' }

describe('ExportImageButton', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

  it('클릭 시 현재 배치로 양식 이미지를 만들어 다운로드', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ExportImageButton students={students} arrangement={arrangement} />)
    await userEvent.click(screen.getByRole('button', { name: /이미지 저장/ }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(renderSeatChartPng).toHaveBeenCalledWith(students, arrangement)
    expect((click.mock.contexts[0] as HTMLAnchorElement).href).toBe('data:image/png;base64,x')
  })

  it('파일명 날짜는 한국 시간 기준 (UTC로는 전날인 오전 8시 30분)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-27T23:30:00Z'))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<ExportImageButton students={students} arrangement={arrangement} />)
    await userEvent.click(screen.getByRole('button', { name: /이미지 저장/ }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('자리배치_20260928.png')
  })
})
