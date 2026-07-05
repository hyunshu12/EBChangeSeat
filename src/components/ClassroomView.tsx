'use client'

import { useState } from 'react'
import { SeatMap } from './SeatMap'
import type { Arrangement, Student } from '@/lib/types'

export interface LatestInfo {
  executedBy: string
  createdAt: string
}

export function ClassroomView({
  students, initialArrangement, latestInfo,
}: {
  students: Student[]
  initialArrangement: Arrangement | null
  latestInfo: LatestInfo | null
}) {
  const [arrangement] = useState<Arrangement | null>(initialArrangement)

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">EB 자리 배정</h1>
        {latestInfo ? (
          <p className="text-sm opacity-70">
            마지막 실행: {new Intl.DateTimeFormat('ko-KR', {
              dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
            }).format(new Date(latestInfo.createdAt))} · {latestInfo.executedBy}
          </p>
        ) : (
          <p className="text-sm opacity-70">아직 배정 이력이 없습니다</p>
        )}
        <a href="/logs" className="text-sm text-blue-600 underline">전체 로그 보기 →</a>
      </header>
      <SeatMap students={students} arrangement={arrangement} />
    </main>
  )
}
