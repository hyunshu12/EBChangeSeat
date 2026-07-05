import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:image/png;base64,x') }))

import { toPng } from 'html-to-image'
import { createRef } from 'react'
import { ExportImageButton } from '@/components/ExportImageButton'

describe('ExportImageButton', () => {
  it('클릭 시 대상 요소를 PNG로 변환', async () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <div>
        <div ref={ref}>map</div>
        <ExportImageButton targetRef={ref} />
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: /이미지 저장/ }))
    await waitFor(() => expect(toPng).toHaveBeenCalledWith(ref.current, expect.anything()))
  })
})
