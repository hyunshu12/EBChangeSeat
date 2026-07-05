import { ClassroomView } from '@/components/ClassroomView'
import { fetchHistoryRows } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { loadStudents } from '@/lib/roster'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const students = loadStudents()
  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)
  const latest = sessions
    .filter(s => !s.invalidated)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  return (
    <ClassroomView
      students={students}
      initialArrangement={history.current}
      latestInfo={latest ? { executedBy: latest.executed_by ?? '', createdAt: latest.created_at } : null}
    />
  )
}
