import { SessionCard } from '@/components/SessionCard'
import { fetchSessionsWithAssignments } from '@/lib/db'
import { loadStudents } from '@/lib/roster'

export const dynamic = 'force-dynamic'

export default async function LogsPage() {
  const [sessions, students] = await Promise.all([fetchSessionsWithAssignments(), Promise.resolve(loadStudents())])
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">전체 세션 로그</h1>
        <p className="text-sm opacity-70">
          모든 셔플·교환이 시드와 함께 영구 기록됩니다. 기록은 수정·삭제할 수 없습니다.
        </p>
        <a href="/" className="text-sm text-blue-600 underline">← 배치도로</a>
      </header>
      {sessions.length === 0 && <p className="opacity-60">아직 기록이 없습니다.</p>}
      {sessions.map(s => (
        <SessionCard key={s.id} session={s} students={students} />
      ))}
    </main>
  )
}
