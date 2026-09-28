import { describe, expect, it } from 'vitest'
import { drawSeatChart, seatSlot, TEMPLATE_HEIGHT, TEMPLATE_WIDTH } from '@/lib/seatChart'
import { SEAT_IDS } from '@/lib/seats'
import type { Arrangement, Student } from '@/lib/types'
import studentsJson from '@/data/students.json'

const students = studentsJson as Student[]

/** 자리배치도(샘플).png에 실제로 적힌 배치 */
const SAMPLE: Arrangement = {
  '2120': '2-5-R', '2126': '2-5-L', '2118': '1-5-R', '2127': '1-5-L',
  '2112': '3-4-L', '2123': '2-4-R', '2102': '2-4-L', '2124': '1-4-R', '2125': '1-4-L',
  '2104': '3-3-R', '2111': '3-3-L', '2119': '2-3-R', '2107': '2-3-L', '2115': '1-3-R', '2122': '1-3-L',
  '2101': '3-2-R', '2121': '3-2-L', '2116': '2-2-R', '2105': '2-2-L', '2114': '1-2-R', '2103': '1-2-L',
  '2117': '3-1-R', '2110': '3-1-L', '2106': '2-1-R', '2109': '2-1-L', '2113': '1-1-R', '2108': '1-1-L',
}

function recordingContext() {
  const texts: { text: string; x: number; y: number; fillStyle: string }[] = []
  const images: unknown[][] = []
  const ctx = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '', letterSpacing: '',
    drawImage: (...args: unknown[]) => { images.push(args) },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, fillStyle: this.fillStyle })
    },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, images }
}

describe('seatSlot', () => {
  it('27석이 모두 양식 안의 서로 다른 칸에 대응', () => {
    const slots = SEAT_IDS.map(seatSlot)
    expect(new Set(slots.map(s => `${s.x},${s.nameY}`)).size).toBe(27)
    for (const s of slots) {
      expect(s.x).toBeGreaterThan(0)
      expect(s.x).toBeLessThan(TEMPLATE_WIDTH)
      expect(s.nameY).toBeLessThan(TEMPLATE_HEIGHT)
    }
  })
  it('양식은 교탁이 아래인 학생 시점: 3분단 4행 단독석은 왼쪽 분단의 오른쪽 칸', () => {
    expect(seatSlot('3-4-L').x).toBe(seatSlot('3-3-L').x)
    expect(seatSlot('3-4-L').x).toBeGreaterThan(seatSlot('3-3-R').x)
    expect(seatSlot('3-4-L').nameY).toBeLessThan(seatSlot('3-3-L').nameY)
    expect(seatSlot('1-1-L').x).toBeGreaterThan(seatSlot('2-1-R').x)
    expect(seatSlot('1-1-L').nameY).toBeGreaterThan(seatSlot('1-5-L').nameY)
  })
})

describe('drawSeatChart', () => {
  it('양식 이미지를 원본 크기로 먼저 깐다', () => {
    const { ctx, images, texts } = recordingContext()
    const template = {} as CanvasImageSource
    drawSeatChart(ctx, template, students, SAMPLE)
    expect(images).toEqual([[template, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT]])
    expect(texts).toHaveLength(54)
  })
  it('샘플과 같은 칸에 번호(흰색)와 이름(짙은 초록)을 쓴다', () => {
    const { ctx, texts } = recordingContext()
    drawSeatChart(ctx, {} as CanvasImageSource, students, SAMPLE)
    expect(texts).toContainEqual({ text: '20번', x: 1330, y: 531, fillStyle: '#ffffff' })
    expect(texts).toContainEqual({ text: '장세혁', x: 1330, y: 652, fillStyle: '#37584c' })
    expect(texts).toContainEqual({ text: '12번', x: 771, y: 879, fillStyle: '#ffffff' })
    expect(texts).toContainEqual({ text: '서가별', x: 771, y: 1000, fillStyle: '#37584c' })
    expect(texts).toContainEqual({ text: '이은채', x: 284, y: 2024, fillStyle: '#37584c' })
    expect(texts).toContainEqual({ text: '민수연', x: 2867, y: 2024, fillStyle: '#37584c' })
  })
  it('번호는 학번 끝 두 자리, 이름의 공백은 뺀다 (샘플의 "황연")', () => {
    const { ctx, texts } = recordingContext()
    drawSeatChart(ctx, {} as CanvasImageSource, students, SAMPLE)
    expect(texts.map(t => t.text)).toEqual(expect.arrayContaining(['1번', '27번', '황연']))
    expect(texts.map(t => t.text)).not.toContain('황 연')
  })
  it('배치에 없는 학생은 그리지 않는다', () => {
    const { ctx, texts } = recordingContext()
    drawSeatChart(ctx, {} as CanvasImageSource, students, { '2101': '3-2-R' })
    expect(texts.map(t => t.text)).toEqual(['1번', '김근우'])
  })
})
