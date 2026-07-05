'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SessionDetail } from '@/lib/db'
import type { Student } from '@/lib/types'

const fmt = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
})

export function SessionCard({ session, students }: { session: SessionDetail; students: Student[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string) => students.find(s => s.id === id)?.name ?? id

  async function invalidate() {
    setError(null)
    const res = await fetch('/api/invalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin, sessionId: session.id }),
    })
    if (!res.ok) {
      setError('무효 처리에 실패했습니다 (PIN 확인)')
      return
    }
    router.refresh()
  }

  return (
    <article className={`rounded-lg border p-4 ${session.invalidated ? 'opacity-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">{session.type === 'shuffle' ? '🎲 전체 셔플' : '↔ 자리 교환'}</span>
        <span className="text-sm opacity-70">{fmt.format(new Date(session.created_at))}</span>
        <span className="text-sm">실행자: {session.executed_by}</span>
        {session.type === 'shuffle' && (
          <span className="rounded bg-gray-200 px-2 text-xs dark:bg-gray-700">
            직전 자리 피하기 {session.avoid_prev ? 'ON' : 'OFF'}
          </span>
        )}
        {session.invalidated && (
          <span className="rounded bg-red-200 px-2 text-xs text-red-900">
            무효{session.invalidated_at ? ` · ${fmt.format(new Date(session.invalidated_at))} 처리` : ''}
          </span>
        )}
        <button type="button" className="ml-auto text-sm underline" onClick={() => setOpen(o => !o)}>
          {open ? '접기' : '상세'}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 text-sm">
          {session.seed && (
            <p>
              난수 시드: <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{session.seed}</code>
              {' '}(재추첨 {session.redraw_count}회 — 재추첨 시드는 <code>시드#1</code>, <code>시드#2</code>…로 파생)
            </p>
          )}
          {session.type === 'shuffle' && (session.decay_factor != null || session.mc_iterations != null) && (
            <p className="opacity-80">
              추첨 파라미터:{' '}
              {session.decay_factor != null && (
                <>감소 계수 <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{session.decay_factor}</code></>
              )}
              {session.decay_factor != null && session.mc_iterations != null && ' · '}
              {session.mc_iterations != null && (
                <>시뮬레이션 <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{session.mc_iterations.toLocaleString('ko-KR')}</code>회</>
              )}
            </p>
          )}
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-1">학생</th>
                <th>배정 자리</th>
                {session.type === 'shuffle' && <th>당시 사전 확률</th>}
              </tr>
            </thead>
            <tbody>
              {session.assignments.map(a => (
                <tr key={a.student_id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1">{nameOf(a.student_id)}</td>
                  <td>{a.seat_id}</td>
                  {session.type === 'shuffle' && (
                    <td>
                      {session.prob_snapshot?.[a.student_id]?.[a.seat_id] !== undefined
                        ? `${((session.prob_snapshot[a.student_id][a.seat_id]) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {session.prob_snapshot && (
            <details>
              <summary className="cursor-pointer">확률 스냅샷 원본 (JSON)</summary>
              <pre className="max-h-64 overflow-auto rounded bg-gray-100 p-2 text-xs dark:bg-gray-800">
                {JSON.stringify(session.prob_snapshot, null, 2)}
              </pre>
            </details>
          )}
          {!session.invalidated && (
            <div className="flex items-end gap-2">
              <label className="block text-xs">
                PIN 입력 후 무효 처리 (기록은 남고 확률 계산에서만 제외)
                <input aria-label="무효 PIN" value={pin} type="password" maxLength={6}
                  onChange={e => setPin(e.target.value)}
                  className="mt-1 block w-24 rounded border px-2 py-1 dark:bg-gray-800" />
              </label>
              <button type="button" onClick={invalidate} disabled={!pin}
                className="rounded border border-red-400 px-3 py-1 text-xs text-red-600 disabled:opacity-40">
                이 세션 무효 처리
              </button>
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
