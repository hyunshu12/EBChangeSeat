'use client'

import { useState } from 'react'
import { renderSeatChartPng } from '@/lib/seatChart'
import type { Arrangement, Student } from '@/lib/types'

export function ExportImageButton({ students, arrangement }: { students: Student[]; arrangement: Arrangement }) {
  const [busy, setBusy] = useState(false)

  async function download() {
    setBusy(true)
    try {
      const dataUrl = await renderSeatChartPng(students, arrangement)
      const a = document.createElement('a')
      // en-CA 형식은 YYYY-MM-DD. 한국 시간 기준 날짜로 파일명을 붙인다
      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date()).replaceAll('-', '')
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
