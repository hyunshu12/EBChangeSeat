import { describe, expect, it } from 'vitest'
import { drawAssignment, DrawImpossibleError } from '@/lib/draw'
import { SEATS, SEAT_IDS } from '@/lib/seats'
import type { HistoryState, Seat, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }
const base = { students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 }

describe('drawAssignment', () => {
  it('전단사: 27명 전원이 서로 다른 좌석에 배정', () => {
    const { arrangement } = drawAssignment({ ...base, seed: 'bijection' })
    const seatsUsed = Object.values(arrangement)
    expect(Object.keys(arrangement)).toHaveLength(27)
    expect(new Set(seatsUsed).size).toBe(27)
    for (const seatId of seatsUsed) expect(SEAT_IDS).toContain(seatId)
  })

  it('결정론: 같은 입력+시드 → 같은 결과', () => {
    const a = drawAssignment({ ...base, seed: 'repro' })
    const b = drawAssignment({ ...base, seed: 'repro' })
    expect(a.arrangement).toEqual(b.arrangement)
    expect(a.redrawCount).toBe(b.redrawCount)
  })

  it('avoidPrev ON → 누구도 직전 자리에 배정되지 않음 (시드 200개 검사)', () => {
    const prev = drawAssignment({ ...base, seed: 'make-prev' }).arrangement
    const history: HistoryState = { counts: {}, current: prev }
    for (let i = 0; i < 200; i++) {
      const { arrangement } = drawAssignment({ ...base, history, avoidPrev: true, seed: `avoid-${i}` })
      for (const [studentId, seatId] of Object.entries(arrangement)) {
        expect(seatId).not.toBe(prev[studentId])
      }
    }
  })

  it('고정석 학생은 항상 고정석, 다른 학생은 그 좌석 불가', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '2-3-L' } : s))
    for (let i = 0; i < 50; i++) {
      const { arrangement } = drawAssignment({ ...base, students: withFixed, seed: `fixed-${i}` })
      expect(arrangement['2501']).toBe('2-3-L')
      const others = Object.entries(arrangement).filter(([id]) => id !== '2501')
      expect(others.map(([, seat]) => seat)).not.toContain('2-3-L')
    }
  })

  it('고정석은 avoidPrev보다 우선 (직전 자리 = 고정석이어도 배정됨)', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '1-1-L' } : s))
    const history: HistoryState = { counts: {}, current: { '2501': '1-1-L' } }
    const { arrangement } = drawAssignment({ ...base, students: withFixed, history, avoidPrev: true, seed: 's' })
    expect(arrangement['2501']).toBe('1-1-L')
  })

  it('막다른 길 → 파생 시드로 재추첨하고 redrawCount 기록 (3명 미니 시나리오)', () => {
    // 막다른 길은 3-순환(3-cycle) 이상에서만 발생한다.
    // 2명·2좌석(맞바꾸기)은 각 학생의 직전 자리가 곧 상대의 유일한 목표 자리여서
    // 그리디가 결코 마지막 학생을 가두지 못한다 → 재추첨이 구조적으로 0회.
    // 그래서 avoidPrev 3-순환(a→b→c→a 방향으로 밀려야 하는 배정)으로 검증한다.
    const miniSeats: Seat[] = [
      { id: '1-1-L', block: 1, row: 1, col: 'L' },
      { id: '1-1-R', block: 1, row: 1, col: 'R' },
      { id: '1-2-L', block: 1, row: 2, col: 'L' },
    ]
    const miniStudents: Student[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const history: HistoryState = { counts: {}, current: { a: '1-1-L', b: '1-1-R', c: '1-2-L' } }
    // 유효 배정은 두 derangement 중 하나. 결과가 유일하지 않으므로 속성으로 검증한다:
    //   (1) 전단사, (2) 누구도 직전 자리에 앉지 않음(avoidPrev), (3) 재추첨 경로가 실제 실행됨.
    let sawRedraw = false
    for (let i = 0; i < 100; i++) {
      const r = drawAssignment({
        students: miniStudents, seats: miniSeats, history,
        avoidPrev: true, decayFactor: 0.5, seed: `dead-${i}`,
      })
      expect(Object.keys(r.arrangement)).toHaveLength(3)
      expect(new Set(Object.values(r.arrangement)).size).toBe(3) // 전단사
      expect(r.arrangement['a']).not.toBe('1-1-L')
      expect(r.arrangement['b']).not.toBe('1-1-R')
      expect(r.arrangement['c']).not.toBe('1-2-L')
      if (r.redrawCount > 0) sawRedraw = true
    }
    expect(sawRedraw).toBe(true) // 재추첨 경로가 실제로 실행되었음을 보장
  })

  it('재추첨 결과도 결정론적 (재추첨이 실제 일어나는 시드로 검증)', () => {
    const miniSeats: Seat[] = [
      { id: '1-1-L', block: 1, row: 1, col: 'L' },
      { id: '1-1-R', block: 1, row: 1, col: 'R' },
      { id: '1-2-L', block: 1, row: 2, col: 'L' },
    ]
    const miniStudents: Student[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
    const history: HistoryState = { counts: {}, current: { a: '1-1-L', b: '1-1-R', c: '1-2-L' } }
    // seed 'dead-0'은 이 시나리오에서 redrawCount>0 → 재추첨 경로 자체의 결정론을 검증.
    const run = () => drawAssignment({
      students: miniStudents, seats: miniSeats, history,
      avoidPrev: true, decayFactor: 0.5, seed: 'dead-0',
    })
    const a = run()
    const b = run()
    expect(a).toEqual(b)
    expect(a.redrawCount).toBeGreaterThan(0) // 재추첨 경로가 실제 실행됨을 확인
  })

  it('배정 불가능 구조 → DrawImpossibleError (좌석 1·학생 1·직전 자리 회피)', () => {
    const oneSeat: Seat[] = [{ id: '1-1-L', block: 1, row: 1, col: 'L' }]
    const oneStudent: Student[] = [{ id: 'a', name: 'A' }]
    const history: HistoryState = { counts: {}, current: { a: '1-1-L' } }
    expect(() =>
      drawAssignment({
        students: oneStudent, seats: oneSeat, history,
        avoidPrev: true, decayFactor: 0.5, seed: 's', maxRedraws: 10,
      }),
    ).toThrow(DrawImpossibleError)
  })

  it('인원·좌석 수 불일치 → 에러', () => {
    expect(() => drawAssignment({ ...base, students: students.slice(0, 26), seed: 's' })).toThrow()
  })
})
