'use client'

import { useState } from 'react'
import type { Arrangement, Student } from '@/lib/types'

const ERROR_MESSAGES: Record<string, string> = {
  wrong_pin: 'PIN이 올바르지 않습니다',
  rate_limited: '시도 횟수를 초과했습니다. 10분 후 다시 시도하세요',
  no_arrangement: '아직 배정된 자리가 없습니다',
}

export function SwapControls({
  picks, onResult, onCancel,
}: {
  picks: Student[]
  onResult: (arrangement: Arrangement) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          executedBy: name.trim(), pin,
          studentA: picks[0].id, studentB: picks[1].id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(ERROR_MESSAGES[json.error] ?? '교환에 실패했습니다')
        return
      }
      onResult(json.arrangement)
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-amber-400 p-4">
      <h2 className="font-bold">자리 바꾸기</h2>
      <p className="text-sm">
        선택: {picks.map(p => p.name).join(' ↔ ') || '배치도에서 두 명을 클릭하세요'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          이름
          <input aria-label="이름" value={name} maxLength={20} onChange={e => setName(e.target.value)}
            className="mt-1 block w-32 rounded border px-2 py-1 dark:bg-gray-800" placeholder="실행자 이름" />
        </label>
        <label className="block text-sm">
          PIN
          <input aria-label="PIN" value={pin} type="password" inputMode="numeric" maxLength={6}
            onChange={e => setPin(e.target.value)}
            className="mt-1 block w-24 rounded border px-2 py-1 dark:bg-gray-800" placeholder="공유 PIN" />
        </label>
        <button type="button" onClick={run} disabled={busy || picks.length !== 2 || !name.trim() || !pin}
          className="rounded bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
          {busy ? '교환 중…' : '↔ 교환 실행'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm underline">취소</button>
      </div>
      <p className="text-xs opacity-60">교환도 공개 로그에 기록되며, 다음 셔플의 &lsquo;직전 자리&rsquo; 기준이 됩니다.</p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </section>
  )
}
