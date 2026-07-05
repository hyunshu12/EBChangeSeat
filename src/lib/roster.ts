import studentsJson from '@/data/students.json'
import { SEAT_IDS, SEATS } from './seats'
import type { Student } from './types'

export class RosterError extends Error {}

export function validateStudents(students: Student[]): Student[] {
  if (students.length !== SEATS.length) {
    throw new RosterError(`명단 인원(${students.length})이 좌석 수(${SEATS.length})와 다릅니다`)
  }
  if (new Set(students.map(s => s.id)).size !== students.length) {
    throw new RosterError('학번이 중복되었습니다')
  }
  const seatIdSet = new Set(SEAT_IDS)
  const fixedSeats = students.map(s => s.fixedSeatId).filter((v): v is string => !!v)
  for (const seatId of fixedSeats) {
    if (!seatIdSet.has(seatId)) throw new RosterError(`존재하지 않는 고정석: ${seatId}`)
  }
  if (new Set(fixedSeats).size !== fixedSeats.length) {
    throw new RosterError('고정석이 중복 지정되었습니다')
  }
  return students
}

export function loadStudents(): Student[] {
  return validateStudents(studentsJson as Student[])
}
