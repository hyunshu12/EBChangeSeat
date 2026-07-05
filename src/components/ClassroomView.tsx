'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SeatMap } from './SeatMap'
import { ShuffleControls } from './ShuffleControls'
import { SwapControls } from './SwapControls'
import type { Arrangement, ProbMatrix, Student } from '@/lib/types'

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
  const router = useRouter()
  const [arrangement, setArrangement] = useState<Arrangement | null>(initialArrangement)
  const [avoidPrev, setAvoidPrevState] = useState(true)
  const [revealKey, setRevealKey] = useState(0)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [probs, setProbs] = useState<ProbMatrix | null>(null)
  const [probsLoading, setProbsLoading] = useState(false)
  const [swapMode, setSwapMode] = useState(false)
  const [swapPicks, setSwapPicks] = useState<string[]>([])

  const setAvoidPrev = useCallback((v: boolean) => {
    setAvoidPrevState(v)
    setProbs(null) // 토글이 바뀌면 확률도 달라짐 → 캐시 무효화
  }, [])

  const selectStudent = useCallback(async (studentId: string | null) => {
    if (!studentId || studentId === selectedStudentId) {
      setSelectedStudentId(null)
      return
    }
    setSelectedStudentId(studentId)
    if (!probs && !probsLoading) {
      setProbsLoading(true)
      try {
        const res = await fetch(`/api/probabilities?avoidPrev=${avoidPrev}`)
        if (res.ok) setProbs((await res.json()).probabilities)
      } finally {
        setProbsLoading(false)
      }
    }
  }, [selectedStudentId, probs, probsLoading, avoidPrev])

  const handleShuffleResult = useCallback((next: Arrangement) => {
    setArrangement(next)
    setRevealKey(k => k + 1) // 카드 뒤집기 연출 재생
    setProbs(null) // 이력이 늘었으므로 확률 재계산 필요
    setSelectedStudentId(null)
    router.refresh()
  }, [router])

  const handleSeatClick = useCallback((_seatId: string, occupantId: string | null) => {
    if (!swapMode) {
      void selectStudent(occupantId)
      return
    }
    if (!occupantId) return
    setSwapPicks(prev =>
      prev.includes(occupantId) ? prev.filter(id => id !== occupantId)
      : prev.length < 2 ? [...prev, occupantId] : prev,
    )
  }, [swapMode, selectStudent])

  const handleSwapResult = useCallback((next: Arrangement) => {
    setArrangement(next)
    setSwapMode(false)
    setSwapPicks([])
    setProbs(null) // 직전 자리가 바뀌므로 확률도 갱신
    router.refresh()
  }, [router])

  const probRow = selectedStudentId && probs ? probs[selectedStudentId] : null

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

      <ShuffleControls avoidPrev={avoidPrev} onAvoidPrevChange={setAvoidPrev} onResult={handleShuffleResult} />

      {arrangement && !swapMode && (
        <button type="button" onClick={() => setSwapMode(true)} className="text-sm underline">
          ↔ 자리 바꾸기 모드
        </button>
      )}
      {swapMode && (
        <SwapControls
          picks={swapPicks.map(id => students.find(s => s.id === id)!).filter(Boolean)}
          onResult={handleSwapResult}
          onCancel={() => { setSwapMode(false); setSwapPicks([]) }}
        />
      )}

      {selectedStudentId && (
        <p className="text-sm">
          <strong>{students.find(s => s.id === selectedStudentId)?.name}의 다음 셔플 자리별 확률</strong>
          {probsLoading && ' — 확률 계산 중…'}
          <button type="button" className="ml-2 text-blue-600 underline" onClick={() => setSelectedStudentId(null)}>
            닫기
          </button>
        </p>
      )}

      <SeatMap
        students={students}
        arrangement={arrangement}
        probRow={probRow}
        selectedStudentId={selectedStudentId}
        swapPicks={swapPicks}
        revealKey={revealKey}
        onSeatClick={handleSeatClick}
      />

      {!arrangement && (
        <section className="flex flex-wrap gap-2">
          {students.map(s => (
            <button
              key={s.id} type="button" onClick={() => selectStudent(s.id)}
              className={`rounded-full border px-3 py-1 text-sm ${s.id === selectedStudentId ? 'ring-2 ring-blue-500' : ''}`}
            >
              {s.name}
            </button>
          ))}
        </section>
      )}
    </main>
  )
}
