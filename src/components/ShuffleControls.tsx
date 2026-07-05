'use client'

import { useState } from 'react'
import type { Arrangement } from '@/lib/types'

const ERROR_MESSAGES: Record<string, string> = {
  wrong_pin: 'PIN이 올바르지 않습니다',
  rate_limited: '시도 횟수를 초과했습니다. 10분 후 다시 시도하세요',
}

export function ShuffleControls({
  avoidPrev, onAvoidPrevChange, onResult,
}: {
  avoidPrev: boolean
  onAvoidPrevChange: (v: boolean) => void
  onResult: (arrangement: Arrangement) => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/shuffle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ executedBy: name.trim(), pin, avoidPrev }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(ERROR_MESSAGES[json.error] ?? '실행에 실패했습니다. 잠시 후 다시 시도하세요')
        return
      }
      setPin('')
      onResult(json.arrangement)
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-gray-300 p-4 dark:border-gray-600">
      <h2 className="font-bold">자리 배정 실행</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          이름
          <input
            aria-label="이름" value={name} maxLength={20}
            onChange={e => setName(e.target.value)}
            className="mt-1 block w-32 rounded border px-2 py-1 dark:bg-gray-800"
            placeholder="실행자 이름"
          />
        </label>
        <label className="block text-sm">
          PIN
          <input
            aria-label="PIN" value={pin} type="password" inputMode="numeric" maxLength={6}
            onChange={e => setPin(e.target.value)}
            className="mt-1 block w-24 rounded border px-2 py-1 dark:bg-gray-800"
            placeholder="공유 PIN"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={avoidPrev} onChange={e => onAvoidPrevChange(e.target.checked)} />
          직전 자리 피하기
        </label>
        <button
          type="button"
          onClick={run}
          disabled={busy || !name.trim() || !pin}
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {busy ? '배정 중…' : '🎲 전체 자리 배정 실행'}
        </button>
      </div>
      <p className="text-xs opacity-60">
        실행자 이름과 사용된 난수 시드는 전체 공개 로그에 기록됩니다. 과거에 앉았던 자리는 확률이
        자동으로 낮아지며, 정확한 확률은 각 학생을 클릭해 확인할 수 있습니다.
      </p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </section>
  )
}
