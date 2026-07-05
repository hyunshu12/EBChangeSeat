'use client'

import { toPng } from 'html-to-image'
import type { RefObject } from 'react'
import { useState } from 'react'

export function ExportImageButton({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false)

  async function download() {
    if (!targetRef.current) return
    setBusy(true)
    try {
      const dataUrl = await toPng(targetRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 })
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
      a.href = dataUrl
      a.download = `자리배치_${stamp}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={download} disabled={busy} className="text-sm underline disabled:opacity-40">
      {busy ? '저장 중…' : '📷 배치도 이미지 저장'}
    </button>
  )
}
