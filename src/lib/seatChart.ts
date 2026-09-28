import { SEATS } from './seats'
import type { Arrangement, SeatId, Student } from './types'

/** public/seat-chart/template.png(자리 배치도 양식) 원본 크기(px) */
export const TEMPLATE_WIDTH = 3780
export const TEMPLATE_HEIGHT = 2673

const TEMPLATE_SRC = '/seat-chart/template.png'
const FONT_SRC = '/seat-chart/Pretendard-SemiBold.woff2'
const FONT_FAMILY = 'SeatChartPretendard'
const FONT_STACK = `${FONT_FAMILY}, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`

// 양식은 학생 시점(교탁이 아래)이라 화면 배치도(교탁이 위)를 180° 돌린 모양이다:
// 3분단이 왼쪽·1분단이 오른쪽, 분단 안에서는 R열이 왼쪽, 1행이 맨 아래.
const CARD_LEFT = [48, 535, 1094, 1580, 2144, 2631] // 좌석 칸 왼쪽 x, 양식 왼쪽 열부터
const CARD_TOP = [517, 865, 1194, 1542, 1889] // 좌석 칸 위쪽 y, 양식 맨 윗줄(5행)부터
// 샘플에서 잰 글자 위치(칸 기준): 가로는 번호 배지 중앙, 세로는 글꼴 기준선
const CENTER_DX = 236
const NUMBER_BASELINE_DY = 14
const NAME_BASELINE_DY = 135

export interface SeatSlot {
  x: number
  numberY: number
  nameY: number
}

export function seatSlot(seatId: SeatId): SeatSlot {
  const seat = SEATS.find(s => s.id === seatId)
  if (!seat) throw new Error(`존재하지 않는 좌석: ${seatId}`)
  const left = CARD_LEFT[(3 - seat.block) * 2 + (seat.col === 'R' ? 0 : 1)]
  const top = CARD_TOP[5 - seat.row]
  return { x: left + CENTER_DX, numberY: top + NUMBER_BASELINE_DY, nameY: top + NAME_BASELINE_DY }
}

/** 양식 위에 각 학생의 번호(학번 끝 두 자리)와 이름을 채운다. */
export function drawSeatChart(
  ctx: CanvasRenderingContext2D, template: CanvasImageSource, students: Student[], arrangement: Arrangement,
) {
  ctx.drawImage(template, 0, 0, TEMPLATE_WIDTH, TEMPLATE_HEIGHT)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.letterSpacing = '-2px'
  for (const student of students) {
    const seatId = arrangement[student.id]
    if (!seatId) continue
    const slot = seatSlot(seatId)
    ctx.font = `600 48px ${FONT_STACK}`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(`${Number(student.id.slice(-2))}번`, slot.x, slot.numberY)
    ctx.font = `600 82px ${FONT_STACK}`
    ctx.fillStyle = '#37584c'
    ctx.fillText(student.name.replace(/\s/g, ''), slot.x, slot.nameY)
  }
}

let fontLoading: Promise<void> | null = null

function loadFont(): Promise<void> {
  fontLoading ??= new FontFace(FONT_FAMILY, `url(${FONT_SRC})`, { weight: '600' }).load()
    .then(face => { document.fonts.add(face) })
    .catch(() => { fontLoading = null }) // 글꼴을 못 받아도 대체 글꼴로 저장은 진행
  return fontLoading
}

async function loadTemplate(): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = TEMPLATE_SRC
  await img.decode()
  return img
}

/** 브라우저 전용: 현재 배치를 채운 양식 PNG의 data URL. */
export async function renderSeatChartPng(students: Student[], arrangement: Arrangement): Promise<string> {
  const [template] = await Promise.all([loadTemplate(), loadFont()])
  const canvas = document.createElement('canvas')
  canvas.width = TEMPLATE_WIDTH
  canvas.height = TEMPLATE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스를 사용할 수 없습니다')
  drawSeatChart(ctx, template, students, arrangement)
  return canvas.toDataURL('image/png')
}
