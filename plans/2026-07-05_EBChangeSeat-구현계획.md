# EB Change Seat 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 반 전용 투명 자리 배정 사이트 — 시드 공개·확률 공개·전체 로그 공개로 "조작 불가능"을 증명할 수 있는 27석 자리 셔플 웹앱.

**Architecture:** Next.js App Router. 모든 무작위성·확률 계산·PIN 검증은 서버(API Route)에서 수행. 배정 알고리즘은 순수 함수 모듈(`src/lib/`)로 분리해 UI/DB 없이 단위·통계 검증. 이력은 Supabase의 append-only 세션 로그에서 순수 함수로 파생.

**Tech Stack:** Next.js (App Router, TypeScript, Tailwind), Supabase (PostgreSQL, service-role 서버 전용), seedrandom, Vitest + Testing Library, html-to-image.

## Global Constraints

- 스펙 원본: 프로젝트 루트 `PRD.md` (모든 요구사항의 원천, 충돌 시 PRD 우선)
- 좌석 27석 고정: 1분단 5행×2열, 2분단 5행×2열, 3분단 1~3행×2열 + **4행 왼쪽 1석**(`3-4-L`). 화면 상단 = 교탁(앞)
- 감소 계수 기본값 **0.5**, 환경 변수 `DECAY_FACTOR`로 변경 가능
- 몬테카를로 반복 기본값 **10000**, `MC_ITERATIONS`로 변경 가능
- PIN은 환경 변수 `SHUFFLE_PIN`으로만 관리 (실제 값 0119는 `.env.local`/Vercel에만 — **코드·저장소에 절대 하드코딩 금지**, `.env.example`에는 자리표시자)
- 배정 알고리즘 코드(`src/lib/`)에서 `Math.random()` 사용 금지 — 모든 난수는 시드 PRNG(`rng.ts`) 경유
- 조회(GET)는 인증 없음, 변경(POST)은 전부 PIN 필요
- 로그는 append-only: 삭제 API를 만들지 않는다. 무효 처리는 `invalidated=true` 마킹만
- UI 문구는 한국어
- TypeScript strict 모드, 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## 파일 구조 (전체 조감)

```
src/
  config.ts                  # decayFactor/mcIterations/maxRedraws (env 파싱)
  data/students.json         # 27명 명단 (학번·이름·고정석) — 사용자가 실명으로 교체
  lib/
    types.ts                 # 공용 타입
    seats.ts                 # 27석 좌석 정의
    roster.ts                # students.json 로드 + 검증
    rng.ts                   # 시드 PRNG, Fisher-Yates, 가중치 추첨
    history.ts               # 세션 로그 → 이력(횟수·현재 배치) 파생 (순수)
    weights.ts               # 가중치 행렬 계산 (순수)
    draw.ts                  # 배정 추첨 + 막다른 길 재추첨 (순수·결정론)
    montecarlo.ts            # 몬테카를로 확률 추정 (순수·결정론)
    auth.ts                  # PIN 검증 (timing-safe)
    supabase.ts              # service-role 클라이언트
    db.ts                    # DB 쿼리 레이어 (thin)
  app/
    page.tsx                 # 메인 (현재 배치 + 컨트롤)
    logs/page.tsx            # 로그 열람
    api/shuffle/route.ts
    api/swap/route.ts
    api/invalidate/route.ts
    api/probabilities/route.ts
  components/
    ClassroomView.tsx        # 클라이언트 오케스트레이터 (상태 관리)
    SeatMap.tsx              # 배치도 (표시 전용)
    ShuffleControls.tsx      # 이름/PIN/토글/실행 + 에러 표시
    SwapControls.tsx         # 자리 교환 모드
    ExportImageButton.tsx    # PNG 내보내기
    SessionCard.tsx          # 로그 상세 카드 (+무효 처리)
supabase/migrations/001_init.sql
docs/algorithm.md            # 알고리즘 공개 문서 (투명성)
tests/statistical.test.ts    # 통계 검증 스위트 (카이제곱 등)
```

테스트는 소스 옆에 콜로케이션(`src/lib/rng.test.ts` 등), 통계 스위트만 `tests/`.

---

### Task 1: 프로젝트 스캐폴딩 + 테스트 인프라

**Files:**
- Create: Next.js 스캐폴드 전체, `vitest.config.ts`, `vitest.setup.ts`, `src/config.ts`, `src/config.test.ts`, `.env.example`

**Interfaces:**
- Produces: `config: { decayFactor: number; mcIterations: number; maxRedraws: number }` (`@/config`), `npm test` 동작

- [ ] **Step 1: Next.js 스캐폴드 생성 (비어있지 않은 디렉터리 우회)**

```bash
cd /Users/hyeonsyu/Documents/02_Work/02_DevelopeProject/18_EBChangeSeat
npx create-next-app@latest scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --no-turbopack
cp -R scaffold/. .
trash scaffold
```

주의: `rm` 금지(훅 차단) — `trash` 사용. 스캐폴드의 `.gitignore`가 루트로 복사되어 `node_modules`, `.env*`가 무시되는지 확인.

- [ ] **Step 2: 의존성 설치**

```bash
npm install @supabase/supabase-js seedrandom html-to-image
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @types/seedrandom
```

- [ ] **Step 3: Vitest 설정**

`vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
```

`vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

`package.json`의 `scripts`에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: 실패하는 config 테스트 작성**

`src/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { config } from '@/config'

describe('config', () => {
  it('기본값: decayFactor 0.5, mcIterations 10000, maxRedraws 100', () => {
    expect(config.decayFactor).toBe(0.5)
    expect(config.mcIterations).toBe(10000)
    expect(config.maxRedraws).toBe(100)
  })
})
```

Run: `npx vitest run src/config.test.ts` → Expected: FAIL (`@/config` 모듈 없음)

- [ ] **Step 5: config 구현**

`src/config.ts`:

```ts
function num(envValue: string | undefined, fallback: number): number {
  const n = Number(envValue)
  return envValue !== undefined && Number.isFinite(n) && n > 0 ? n : fallback
}

/** 서버 전용 설정. 감소 계수 등은 재배포 없이 환경 변수로 조정 가능. */
export const config = {
  decayFactor: num(process.env.DECAY_FACTOR, 0.5),
  mcIterations: num(process.env.MC_ITERATIONS, 10000),
  maxRedraws: num(process.env.MAX_REDRAWS, 100),
}
```

`.env.example`:

```bash
# Supabase (프로젝트 설정 → API에서 확인)
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
# 셔플/교환/무효처리 공유 PIN — 실제 값은 .env.local과 Vercel에만 설정 (저장소 커밋 금지)
SHUFFLE_PIN=0000
# 배정 알고리즘 파라미터 (선택 — 미설정 시 기본값)
DECAY_FACTOR=0.5
MC_ITERATIONS=10000
MAX_REDRAWS=100
```

- [ ] **Step 6: 테스트·빌드 확인 후 커밋**

Run: `npx vitest run src/config.test.ts` → Expected: PASS
Run: `npm run build` → Expected: 성공

```bash
git add -A
git commit -m "chore: Next.js 스캐폴드 + Vitest + config"
```

---

### Task 2: 타입·좌석 정의·학생 명단

**Files:**
- Create: `src/lib/types.ts`, `src/lib/seats.ts`, `src/lib/seats.test.ts`, `src/data/students.json`, `src/lib/roster.ts`, `src/lib/roster.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `SeatId`(string), `Student { id: string; name: string; fixedSeatId?: SeatId }`, `Seat { id: SeatId; block: 1|2|3; row: number; col: 'L'|'R' }`, `Arrangement = Record<string, SeatId>`, `HistoryState { counts: Record<string, Record<SeatId, number>>; current: Arrangement | null }`, `WeightMatrix = Record<string, Record<SeatId, number>>`, `ProbMatrix = Record<string, Record<SeatId, number>>`, `DrawResult { arrangement: Arrangement; seed: string; redrawCount: number }`
  - `seats.ts`: `SEATS: Seat[]` (27개), `SEAT_IDS: SeatId[]`
  - `roster.ts`: `loadStudents(): Student[]` (검증 포함), `RosterError`

- [ ] **Step 1: 타입 정의**

`src/lib/types.ts`:

```ts
export type SeatId = string // 형식: `${분단}-${행}-${'L'|'R'}` 예: '2-3-L'

export interface Seat {
  id: SeatId
  block: 1 | 2 | 3
  row: number // 1 = 교탁 쪽(맨 앞)
  col: 'L' | 'R'
}

export interface Student {
  id: string // 학번
  name: string
  fixedSeatId?: SeatId // 지정 시 추첨 제외, 항상 이 자리 (직전 자리 회피 규칙보다 우선)
}

/** studentId → seatId. 유효한 배치는 전단사(모든 학생·모든 좌석이 정확히 1회). */
export type Arrangement = Record<string, SeatId>

export interface HistoryState {
  /** counts[studentId][seatId] = 그 자리에 앉았던 배치 기간 수 (현재 진행 중 기간 포함) */
  counts: Record<string, Record<SeatId, number>>
  /** 스왑 반영된 현재 배치. 셔플 이력이 없으면 null */
  current: Arrangement | null
}

export type WeightMatrix = Record<string, Record<SeatId, number>>
export type ProbMatrix = Record<string, Record<SeatId, number>>

export interface DrawResult {
  arrangement: Arrangement
  /** 루트 시드. 재추첨 k회째 시드는 `${seed}#${k}`로 결정론적 파생 → seed+redrawCount만으로 전 과정 재현 */
  seed: string
  redrawCount: number
}
```

- [ ] **Step 2: 실패하는 좌석 테스트 작성**

`src/lib/seats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SEATS, SEAT_IDS } from '@/lib/seats'

describe('SEATS', () => {
  it('총 27석', () => {
    expect(SEATS).toHaveLength(27)
  })
  it('분단별 10/10/7석', () => {
    expect(SEATS.filter(s => s.block === 1)).toHaveLength(10)
    expect(SEATS.filter(s => s.block === 2)).toHaveLength(10)
    expect(SEATS.filter(s => s.block === 3)).toHaveLength(7)
  })
  it('3분단 4행은 왼쪽 한 자리뿐', () => {
    expect(SEAT_IDS).toContain('3-4-L')
    expect(SEAT_IDS).not.toContain('3-4-R')
    expect(SEAT_IDS.filter(id => id.startsWith('3-5'))).toHaveLength(0)
  })
  it('좌석 ID 중복 없음', () => {
    expect(new Set(SEAT_IDS).size).toBe(27)
  })
})
```

Run: `npx vitest run src/lib/seats.test.ts` → Expected: FAIL (모듈 없음)

- [ ] **Step 3: 좌석 구현**

`src/lib/seats.ts`:

```ts
import type { Seat, SeatId } from './types'

function fullRows(block: 1 | 2 | 3, rowCount: number): Seat[] {
  const out: Seat[] = []
  for (let row = 1; row <= rowCount; row++) {
    for (const col of ['L', 'R'] as const) {
      out.push({ id: `${block}-${row}-${col}`, block, row, col })
    }
  }
  return out
}

/** 교실 좌석 27석. row 1이 교탁(앞) 쪽. 3분단은 4행 왼쪽 1석으로 끝남. */
export const SEATS: Seat[] = [
  ...fullRows(1, 5),
  ...fullRows(2, 5),
  ...fullRows(3, 3),
  { id: '3-4-L', block: 3, row: 4, col: 'L' },
]

export const SEAT_IDS: SeatId[] = SEATS.map(s => s.id)
```

Run: `npx vitest run src/lib/seats.test.ts` → Expected: PASS

- [ ] **Step 4: 학생 명단 자리표시자 작성**

`src/data/students.json` (사용자가 실명으로 교체할 자리표시자 — 학번 2501~2527):

```json
[
  { "id": "2501", "name": "학생01" },
  { "id": "2502", "name": "학생02" },
  { "id": "2503", "name": "학생03" },
  { "id": "2504", "name": "학생04" },
  { "id": "2505", "name": "학생05" },
  { "id": "2506", "name": "학생06" },
  { "id": "2507", "name": "학생07" },
  { "id": "2508", "name": "학생08" },
  { "id": "2509", "name": "학생09" },
  { "id": "2510", "name": "학생10" },
  { "id": "2511", "name": "학생11" },
  { "id": "2512", "name": "학생12" },
  { "id": "2513", "name": "학생13" },
  { "id": "2514", "name": "학생14" },
  { "id": "2515", "name": "학생15" },
  { "id": "2516", "name": "학생16" },
  { "id": "2517", "name": "학생17" },
  { "id": "2518", "name": "학생18" },
  { "id": "2519", "name": "학생19" },
  { "id": "2520", "name": "학생20" },
  { "id": "2521", "name": "학생21" },
  { "id": "2522", "name": "학생22" },
  { "id": "2523", "name": "학생23" },
  { "id": "2524", "name": "학생24" },
  { "id": "2525", "name": "학생25" },
  { "id": "2526", "name": "학생26" },
  { "id": "2527", "name": "학생27" }
]
```

고정석이 필요한 학생은 `"fixedSeatId": "1-1-L"`처럼 필드를 추가.

- [ ] **Step 5: 실패하는 roster 테스트 작성**

`src/lib/roster.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { loadStudents, validateStudents, RosterError } from '@/lib/roster'
import type { Student } from '@/lib/types'

const valid: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${String(i + 1).padStart(2, '0')}`,
}))

describe('roster', () => {
  it('students.json 로드: 27명, 학번 중복 없음', () => {
    const students = loadStudents()
    expect(students).toHaveLength(27)
    expect(new Set(students.map(s => s.id)).size).toBe(27)
  })
  it('인원수가 좌석수와 다르면 RosterError', () => {
    expect(() => validateStudents(valid.slice(0, 26))).toThrow(RosterError)
  })
  it('학번 중복이면 RosterError', () => {
    const dup = [...valid.slice(0, 26), { ...valid[0], name: '복제' }]
    expect(() => validateStudents(dup)).toThrow(RosterError)
  })
  it('존재하지 않는 고정석이면 RosterError', () => {
    const bad = valid.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '9-9-L' } : s))
    expect(() => validateStudents(bad)).toThrow(RosterError)
  })
  it('고정석 중복이면 RosterError', () => {
    const bad = valid.map((s, i) => (i <= 1 ? { ...s, fixedSeatId: '1-1-L' } : s))
    expect(() => validateStudents(bad)).toThrow(RosterError)
  })
})
```

Run: `npx vitest run src/lib/roster.test.ts` → Expected: FAIL

- [ ] **Step 6: roster 구현**

`src/lib/roster.ts`:

```ts
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
```

Run: `npx vitest run src/lib/roster.test.ts src/lib/seats.test.ts` → Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/seats.ts src/lib/seats.test.ts src/data/students.json src/lib/roster.ts src/lib/roster.test.ts
git commit -m "feat: 좌석 27석 정의 + 학생 명단 로더/검증"
```

---

### Task 3: 시드 PRNG·셔플·가중치 추첨 (rng.ts)

**Files:**
- Create: `src/lib/rng.ts`, `src/lib/rng.test.ts`

**Interfaces:**
- Produces: `Rng = () => number`, `createRng(seed: string): Rng`, `generateSeed(): string`(32자 hex), `shuffled<T>(arr: readonly T[], rng: Rng): T[]`, `weightedPick(weights: readonly number[], rng: Rng): number`, `AllWeightsZeroError`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { AllWeightsZeroError, createRng, generateSeed, shuffled, weightedPick } from '@/lib/rng'

describe('createRng', () => {
  it('같은 시드 → 같은 수열 (결정론)', () => {
    const a = createRng('seed-1')
    const b = createRng('seed-1')
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })
  it('다른 시드 → 다른 수열', () => {
    const a = createRng('seed-1')
    const b = createRng('seed-2')
    const same = Array.from({ length: 20 }, () => a() === b())
    expect(same.every(Boolean)).toBe(false)
  })
})

describe('generateSeed', () => {
  it('32자 hex, 호출마다 다름', () => {
    const s1 = generateSeed()
    const s2 = generateSeed()
    expect(s1).toMatch(/^[0-9a-f]{32}$/)
    expect(s1).not.toBe(s2)
  })
})

describe('shuffled', () => {
  it('순열이다 (원소 보존)', () => {
    const input = Array.from({ length: 27 }, (_, i) => i)
    const out = shuffled(input, createRng('s'))
    expect([...out].sort((a, b) => a - b)).toEqual(input)
    expect(out).not.toBe(input) // 원본 불변
  })
  it('시드 결정론', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffled(input, createRng('x'))).toEqual(shuffled(input, createRng('x')))
  })
})

describe('weightedPick', () => {
  it('가중치 0인 항목은 절대 선택되지 않음', () => {
    const rng = createRng('zero-test')
    for (let i = 0; i < 5000; i++) {
      expect(weightedPick([0, 1, 0, 1, 0], rng)).not.toBeOneOf([0, 2, 4])
    }
  })
  it('전부 0이면 AllWeightsZeroError', () => {
    expect(() => weightedPick([0, 0, 0], createRng('s'))).toThrow(AllWeightsZeroError)
  })
  it('음수/NaN 가중치는 에러', () => {
    expect(() => weightedPick([1, -1], createRng('s'))).toThrow()
    expect(() => weightedPick([1, NaN], createRng('s'))).toThrow()
  })
  it('빈도가 가중치에 비례 (2:1, 허용오차 ±3%p)', () => {
    const rng = createRng('ratio-test')
    let first = 0
    const n = 30000
    for (let i = 0; i < n; i++) if (weightedPick([2, 1], rng) === 0) first++
    expect(first / n).toBeGreaterThan(2 / 3 - 0.03)
    expect(first / n).toBeLessThan(2 / 3 + 0.03)
  })
})
```

참고: `toBeOneOf`는 vitest 3에 내장. 없으면 `expect([0,2,4]).not.toContain(pick)`으로 대체.

Run: `npx vitest run src/lib/rng.test.ts` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/lib/rng.ts`:

```ts
import seedrandom from 'seedrandom'

export type Rng = () => number

/** 시드 문자열 → 결정론적 [0,1) 난수 생성기. 알고리즘 코드의 유일한 난수 원천. */
export function createRng(seed: string): Rng {
  return seedrandom(seed)
}

/** 128비트 루트 시드. Web Crypto 사용 (Node/Edge 겸용, 클라이언트 번들 안전). */
export function generateSeed(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** Fisher-Yates — 모든 순열이 균등 확률. 원본 배열은 변경하지 않음. */
export function shuffled<T>(arr: readonly T[], rng: Rng): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export class AllWeightsZeroError extends Error {
  constructor() {
    super('모든 가중치가 0이라 추첨할 수 없습니다')
  }
}

/** 가중치 비례 인덱스 추첨. 부동소수점 누적 오차는 마지막 양수 항목으로 방어. */
export function weightedPick(weights: readonly number[], rng: Rng): number {
  let total = 0
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) throw new Error(`잘못된 가중치: ${w}`)
    total += w
  }
  if (total <= 0) throw new AllWeightsZeroError()
  const r = rng() * total
  let acc = 0
  let lastPositive = -1
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue
    lastPositive = i
    acc += weights[i]
    if (r < acc) return i
  }
  return lastPositive
}
```

Run: `npx vitest run src/lib/rng.test.ts` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/rng.ts src/lib/rng.test.ts
git commit -m "feat: 시드 PRNG + Fisher-Yates + 가중치 추첨"
```

---

### Task 4: 이력 파생 (history.ts)

**Files:**
- Create: `src/lib/history.ts`, `src/lib/history.test.ts`

**Interfaces:**
- Consumes: `types.ts`의 `Arrangement`, `HistoryState`
- Produces: `SessionRow { id: string; created_at: string; type: 'shuffle'|'swap'; invalidated: boolean }`, `AssignmentRow { session_id: string; student_id: string; seat_id: string }`, `deriveHistory(sessions: SessionRow[], assignments: AssignmentRow[]): HistoryState`

**핵심 규칙 (PRD 5.3):**
- 배치 기간 = 셔플 ~ 다음 셔플. 기간의 **최종(스왑 반영) 자리**가 counts에 1회씩 기록됨. 현재 진행 중 기간도 포함.
- `current` = 마지막 셔플에 이후 스왑을 적용한 현재 배치.
- 무효 세션은 이벤트 스트림에서 완전히 제거 후 재생 (스왑도 세션이므로 개별 무효 가능).
- 셔플 이전의 스왑(정상 흐름에선 불가)은 무시.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deriveHistory, type AssignmentRow, type SessionRow } from '@/lib/history'

function shuffle(id: string, at: string): SessionRow {
  return { id, created_at: at, type: 'shuffle', invalidated: false }
}
function swap(id: string, at: string): SessionRow {
  return { id, created_at: at, type: 'swap', invalidated: false }
}
function rows(sessionId: string, pairs: Array<[string, string]>): AssignmentRow[] {
  return pairs.map(([student_id, seat_id]) => ({ session_id: sessionId, student_id, seat_id }))
}

describe('deriveHistory', () => {
  it('이력 없음 → current null, counts 비어있음', () => {
    const h = deriveHistory([], [])
    expect(h.current).toBeNull()
    expect(h.counts).toEqual({})
  })

  it('셔플 1회 → 그 배치가 current이자 counts 1회', () => {
    const h = deriveHistory([shuffle('s1', '2026-07-01T00:00:00Z')], rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]))
    expect(h.current).toEqual({ a: '1-1-L', b: '1-1-R' })
    expect(h.counts['a']['1-1-L']).toBe(1)
  })

  it('셔플 후 스왑 → current와 counts 모두 스왑 반영 후 자리 기준', () => {
    const sessions = [shuffle('s1', '2026-07-01T00:00:00Z'), swap('w1', '2026-07-02T00:00:00Z')]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('w1', [['a', '1-1-R'], ['b', '1-1-L']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.current).toEqual({ a: '1-1-R', b: '1-1-L' })
    expect(h.counts['a']).toEqual({ '1-1-R': 1 }) // 스왑 전 자리는 카운트 안 됨
  })

  it('배치 기간마다 1회씩 누적', () => {
    const sessions = [shuffle('s1', '2026-07-01T00:00:00Z'), shuffle('s2', '2026-07-08T00:00:00Z')]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('s2', [['a', '1-1-L'], ['b', '1-1-R']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.counts['a']['1-1-L']).toBe(2)
  })

  it('무효 세션은 완전히 제외', () => {
    const s2: SessionRow = { ...shuffle('s2', '2026-07-08T00:00:00Z'), invalidated: true }
    const sessions = [shuffle('s1', '2026-07-01T00:00:00Z'), s2]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('s2', [['a', '1-1-R'], ['b', '1-1-L']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.current).toEqual({ a: '1-1-L', b: '1-1-R' })
    expect(h.counts['a']).toEqual({ '1-1-L': 1 })
  })

  it('셔플 이전 스왑은 무시', () => {
    const h = deriveHistory([swap('w1', '2026-07-01T00:00:00Z')], rows('w1', [['a', '1-1-R']]))
    expect(h.current).toBeNull()
    expect(h.counts).toEqual({})
  })

  it('입력 순서와 무관하게 created_at 순으로 재생', () => {
    const sessions = [shuffle('s2', '2026-07-08T00:00:00Z'), shuffle('s1', '2026-07-01T00:00:00Z')]
    const assignments = [
      ...rows('s1', [['a', '1-1-L'], ['b', '1-1-R']]),
      ...rows('s2', [['a', '1-1-R'], ['b', '1-1-L']]),
    ]
    const h = deriveHistory(sessions, assignments)
    expect(h.current).toEqual({ a: '1-1-R', b: '1-1-L' })
  })
})
```

Run: `npx vitest run src/lib/history.test.ts` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/lib/history.ts`:

```ts
import type { Arrangement, HistoryState } from './types'

export interface SessionRow {
  id: string
  created_at: string
  type: 'shuffle' | 'swap'
  invalidated: boolean
}

export interface AssignmentRow {
  session_id: string
  student_id: string
  seat_id: string
}

/**
 * append-only 세션 로그를 시간순 재생해 이력을 파생한다.
 * - 배치 기간(셔플~다음 셔플)의 최종(스왑 반영) 자리가 counts에 1회씩 기록됨 (현재 기간 포함)
 * - 무효 세션은 스트림에서 제거 후 재생
 */
export function deriveHistory(sessions: SessionRow[], assignments: AssignmentRow[]): HistoryState {
  const rowsBySession = new Map<string, AssignmentRow[]>()
  for (const a of assignments) {
    const list = rowsBySession.get(a.session_id)
    if (list) list.push(a)
    else rowsBySession.set(a.session_id, [a])
  }

  const active = sessions
    .filter(s => !s.invalidated)
    .sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id))

  const periods: Arrangement[] = []
  let current: Arrangement | null = null
  for (const s of active) {
    const rows = rowsBySession.get(s.id) ?? []
    if (s.type === 'shuffle') {
      if (current) periods.push(current)
      current = Object.fromEntries(rows.map(r => [r.student_id, r.seat_id]))
    } else if (current) {
      current = { ...current }
      for (const r of rows) current[r.student_id] = r.seat_id
    }
  }
  if (current) periods.push(current)

  const counts: HistoryState['counts'] = {}
  for (const period of periods) {
    for (const [studentId, seatId] of Object.entries(period)) {
      counts[studentId] ??= {}
      counts[studentId][seatId] = (counts[studentId][seatId] ?? 0) + 1
    }
  }
  return { counts, current }
}
```

Run: `npx vitest run src/lib/history.test.ts` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/history.ts src/lib/history.test.ts
git commit -m "feat: 세션 로그 → 이력(횟수/현재배치) 파생"
```

---

### Task 5: 가중치 계산 (weights.ts)

**Files:**
- Create: `src/lib/weights.ts`, `src/lib/weights.test.ts`

**Interfaces:**
- Consumes: `HistoryState`, `Seat`, `Student`, `WeightMatrix`
- Produces: `computeWeights(opts: { students: Student[]; seats: Seat[]; history: HistoryState; avoidPrev: boolean; decayFactor: number }): WeightMatrix` — 고정석 학생은 행에서 제외

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/weights.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SEATS } from '@/lib/seats'
import { computeWeights } from '@/lib/weights'
import type { HistoryState, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }

describe('computeWeights', () => {
  it('이력 없음 → 모든 가중치 1', () => {
    const w = computeWeights({ students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 })
    for (const s of students) for (const t of SEATS) expect(w[s.id][t.id]).toBe(1)
  })

  it('n회 앉은 자리 → decayFactor^n', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 2 } }, current: null }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: false, decayFactor: 0.5 })
    expect(w['2501']['1-1-L']).toBe(0.25)
    expect(w['2501']['1-1-R']).toBe(1)
  })

  it('decayFactor 변경이 반영됨 (0.7)', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: null }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: false, decayFactor: 0.7 })
    expect(w['2501']['1-1-L']).toBeCloseTo(0.7)
  })

  it('avoidPrev ON → 직전 자리만 0, 과거 자리는 감소만', () => {
    const history: HistoryState = {
      counts: { '2501': { '1-1-L': 1, '2-2-R': 1 } },
      current: { '2501': '1-1-L' },
    }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: true, decayFactor: 0.5 })
    expect(w['2501']['1-1-L']).toBe(0)   // 직전 자리 하드 제외
    expect(w['2501']['2-2-R']).toBe(0.5) // 과거 자리는 소프트 감소
  })

  it('avoidPrev OFF → 직전 자리도 감소만 적용', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: { '2501': '1-1-L' } }
    const w = computeWeights({ students, seats: SEATS, history, avoidPrev: false, decayFactor: 0.5 })
    expect(w['2501']['1-1-L']).toBe(0.5)
  })

  it('고정석 학생은 행에서 제외', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '1-1-L' } : s))
    const w = computeWeights({ students: withFixed, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 })
    expect(w['2501']).toBeUndefined()
    expect(Object.keys(w)).toHaveLength(26)
  })

  it('decayFactor가 (0,1] 밖이면 에러', () => {
    for (const bad of [0, -0.5, 1.5]) {
      expect(() =>
        computeWeights({ students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: bad }),
      ).toThrow()
    }
  })
})
```

Run: `npx vitest run src/lib/weights.test.ts` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/lib/weights.ts`:

```ts
import type { HistoryState, Seat, Student, WeightMatrix } from './types'

/**
 * weight(s, t) = decayFactor ^ n(s, t)   — n: 그 자리에 앉았던 배치 기간 수
 * avoidPrev ON이면 직전(현재) 자리만 0으로 하드 제외.
 * 고정석 학생은 추첨 대상이 아니므로 행을 만들지 않는다.
 */
export function computeWeights(opts: {
  students: Student[]
  seats: Seat[]
  history: HistoryState
  avoidPrev: boolean
  decayFactor: number
}): WeightMatrix {
  const { students, seats, history, avoidPrev, decayFactor } = opts
  if (!(decayFactor > 0 && decayFactor <= 1)) {
    throw new Error(`decayFactor는 (0, 1] 범위여야 합니다: ${decayFactor}`)
  }
  const matrix: WeightMatrix = {}
  for (const s of students) {
    if (s.fixedSeatId) continue
    matrix[s.id] = {}
    const prevSeat = history.current?.[s.id]
    for (const t of seats) {
      const n = history.counts[s.id]?.[t.id] ?? 0
      matrix[s.id][t.id] = avoidPrev && prevSeat === t.id ? 0 : Math.pow(decayFactor, n)
    }
  }
  return matrix
}
```

Run: `npx vitest run src/lib/weights.test.ts` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/weights.ts src/lib/weights.test.ts
git commit -m "feat: 이력 기반 가중치 행렬 (감소계수/직전자리 제외)"
```

---

### Task 6: 배정 추첨 (draw.ts)

**Files:**
- Create: `src/lib/draw.ts`, `src/lib/draw.test.ts`

**Interfaces:**
- Consumes: `rng.ts`(`createRng`, `shuffled`, `weightedPick`, `AllWeightsZeroError`), `weights.ts`(`computeWeights`), `roster.ts`(`validateStudents`)
- Produces: `drawAssignment(opts: { students: Student[]; seats: Seat[]; history: HistoryState; avoidPrev: boolean; decayFactor: number; seed: string; maxRedraws?: number }): DrawResult`, `DrawImpossibleError`

**알고리즘 명세 (docs/algorithm.md와 반드시 일치):**
1. 고정석 학생을 먼저 배정하고 그 좌석을 풀에서 제거. 고정석은 avoidPrev보다 우선(하드 제외 면제).
2. 나머지 학생 순서를 Fisher-Yates로 섞는다 (시드 PRNG).
3. 순서대로, 남은 좌석 중 가중치 비례로 추첨.
4. 어떤 학생의 남은 좌석 가중치가 전부 0이면(막다른 길) 그 시도 전체를 폐기하고 파생 시드 `${seed}#${k}` (k=1,2,…)로 처음부터 재추첨. `maxRedraws` 초과 시 `DrawImpossibleError`.
5. 루트 시드 + 재추첨 횟수만으로 전 과정이 결정론적으로 재현된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/draw.test.ts`:

```ts
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

  it('막다른 길 → 파생 시드로 재추첨하고 redrawCount 기록 (2명 미니 시나리오)', () => {
    // 좌석 2개·학생 2명·avoidPrev ON: 학생 순서에 따라 마지막 학생에게 직전 자리만 남는 경우가 생김
    const miniSeats: Seat[] = [
      { id: '1-1-L', block: 1, row: 1, col: 'L' },
      { id: '1-1-R', block: 1, row: 1, col: 'R' },
    ]
    const miniStudents: Student[] = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]
    const history: HistoryState = { counts: {}, current: { a: '1-1-L', b: '1-1-R' } }
    // 유일한 유효 배정은 서로 자리 맞바꾸기. 어떤 시드든 결국 그 결과에 도달해야 함.
    let sawRedraw = false
    for (let i = 0; i < 100; i++) {
      const r = drawAssignment({
        students: miniStudents, seats: miniSeats, history,
        avoidPrev: true, decayFactor: 0.5, seed: `dead-${i}`,
      })
      expect(r.arrangement).toEqual({ a: '1-1-R', b: '1-1-L' })
      if (r.redrawCount > 0) sawRedraw = true
    }
    expect(sawRedraw).toBe(true) // 재추첨 경로가 실제로 실행되었음을 보장
  })

  it('재추첨 결과도 결정론적', () => {
    const miniSeats: Seat[] = [
      { id: '1-1-L', block: 1, row: 1, col: 'L' },
      { id: '1-1-R', block: 1, row: 1, col: 'R' },
    ]
    const miniStudents: Student[] = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]
    const history: HistoryState = { counts: {}, current: { a: '1-1-L', b: '1-1-R' } }
    const run = () => drawAssignment({
      students: miniStudents, seats: miniSeats, history,
      avoidPrev: true, decayFactor: 0.5, seed: 'redraw-repro',
    })
    expect(run()).toEqual(run())
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
```

Run: `npx vitest run src/lib/draw.test.ts` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/lib/draw.ts`:

```ts
import { AllWeightsZeroError, createRng, shuffled, weightedPick, type Rng } from './rng'
import { computeWeights } from './weights'
import type { Arrangement, DrawResult, HistoryState, Seat, Student, WeightMatrix } from './types'

export class DrawImpossibleError extends Error {}

/**
 * 시드 결정론적 자리 배정.
 * 재추첨 k회째 시드는 `${seed}#${k}` — 루트 시드와 redrawCount만으로 전 과정 재현 가능.
 */
export function drawAssignment(opts: {
  students: Student[]
  seats: Seat[]
  history: HistoryState
  avoidPrev: boolean
  decayFactor: number
  seed: string
  maxRedraws?: number
}): DrawResult {
  const { students, seats, history, avoidPrev, decayFactor, seed, maxRedraws = 100 } = opts
  if (students.length !== seats.length) {
    throw new Error(`인원(${students.length})과 좌석(${seats.length}) 수가 다릅니다`)
  }

  const weights = computeWeights({ students, seats, history, avoidPrev, decayFactor })
  const fixed = students.filter(s => s.fixedSeatId)
  const free = students.filter(s => !s.fixedSeatId)
  const fixedSeatIds = new Set(fixed.map(s => s.fixedSeatId as string))
  const pool = seats.filter(t => !fixedSeatIds.has(t.id))

  for (let attempt = 0; attempt <= maxRedraws; attempt++) {
    const attemptSeed = attempt === 0 ? seed : `${seed}#${attempt}`
    const partial = tryDraw(free, pool, weights, createRng(attemptSeed))
    if (partial) {
      const arrangement: Arrangement = { ...partial }
      for (const s of fixed) arrangement[s.id] = s.fixedSeatId as string
      return { arrangement, seed, redrawCount: attempt }
    }
  }
  throw new DrawImpossibleError(`${maxRedraws}회 재추첨 후에도 유효한 배정을 찾지 못했습니다`)
}

/** 한 번의 시도. 막다른 길이면 null (호출자가 파생 시드로 재시도). */
function tryDraw(free: Student[], pool: Seat[], weights: WeightMatrix, rng: Rng): Arrangement | null {
  const order = shuffled(free, rng)
  const remaining = [...pool]
  const arrangement: Arrangement = {}
  for (const s of order) {
    let idx: number
    try {
      idx = weightedPick(remaining.map(t => weights[s.id][t.id]), rng)
    } catch (e) {
      if (e instanceof AllWeightsZeroError) return null
      throw e
    }
    arrangement[s.id] = remaining[idx].id
    remaining.splice(idx, 1)
  }
  return arrangement
}
```

Run: `npx vitest run src/lib/draw.test.ts` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/draw.ts src/lib/draw.test.ts
git commit -m "feat: 시드 결정론 자리 추첨 + 막다른 길 재추첨"
```

---

### Task 7: 몬테카를로 확률 추정 (montecarlo.ts)

**Files:**
- Create: `src/lib/montecarlo.ts`, `src/lib/montecarlo.test.ts`

**Interfaces:**
- Consumes: `draw.ts`(`drawAssignment`)
- Produces: `estimateProbabilities(opts: { students: Student[]; seats: Seat[]; history: HistoryState; avoidPrev: boolean; decayFactor: number; iterations: number; seed: string }): ProbMatrix` — i회째 시뮬레이션 시드는 `${seed}:mc:${i}`로 결정론적

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/montecarlo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { estimateProbabilities } from '@/lib/montecarlo'
import { SEATS } from '@/lib/seats'
import type { HistoryState, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }
const base = { students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 }

describe('estimateProbabilities', () => {
  it('각 학생의 행 합 = 1 (±1e-9)', () => {
    const p = estimateProbabilities({ ...base, iterations: 2000, seed: 'rowsum' })
    for (const s of students) {
      const sum = SEATS.reduce((acc, t) => acc + p[s.id][t.id], 0)
      expect(sum).toBeCloseTo(1, 9)
    }
  })

  it('각 좌석의 열 합 = 1 (전단사 배정의 구조적 불변량)', () => {
    const p = estimateProbabilities({ ...base, iterations: 2000, seed: 'colsum' })
    for (const t of SEATS) {
      const sum = students.reduce((acc, s) => acc + p[s.id][t.id], 0)
      expect(sum).toBeCloseTo(1, 9)
    }
  })

  it('시드 결정론: 같은 시드 → 같은 행렬', () => {
    const a = estimateProbabilities({ ...base, iterations: 500, seed: 'det' })
    const b = estimateProbabilities({ ...base, iterations: 500, seed: 'det' })
    expect(a).toEqual(b)
  })

  it('avoidPrev ON → 직전 자리 확률 정확히 0', () => {
    const prevSeat = '1-1-L'
    const history: HistoryState = { counts: {}, current: { '2501': prevSeat } }
    const p = estimateProbabilities({ ...base, history, avoidPrev: true, iterations: 2000, seed: 'zero' })
    expect(p['2501'][prevSeat]).toBe(0)
  })

  it('고정석 학생 → 고정석 확률 1, 다른 좌석 0, 타 학생은 그 좌석 0', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '2-3-L' } : s))
    const p = estimateProbabilities({ ...base, students: withFixed, iterations: 500, seed: 'fixed' })
    expect(p['2501']['2-3-L']).toBe(1)
    expect(p['2501']['1-1-L']).toBe(0)
    expect(p['2502']['2-3-L']).toBe(0)
  })

  it('한 번 앉은 자리는 균등 확률(1/27)보다 유의미하게 낮음', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: null }
    const p = estimateProbabilities({ ...base, history, iterations: 10000, seed: 'decay' })
    expect(p['2501']['1-1-L']).toBeLessThan(1 / 27 * 0.8)
  })
})
```

Run: `npx vitest run src/lib/montecarlo.test.ts` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/lib/montecarlo.ts`:

```ts
import { drawAssignment } from './draw'
import type { HistoryState, ProbMatrix, Seat, Student } from './types'

/**
 * 실제 배정 알고리즘을 iterations회 실행해 경험적 확률을 추정한다.
 * 근사 공식이 아니라 배정 절차 그 자체의 통계이므로 표시 확률 = 실제 확률.
 * i회째 시드는 `${seed}:mc:${i}` — 시드가 같으면 행렬도 동일(재현 가능).
 */
export function estimateProbabilities(opts: {
  students: Student[]
  seats: Seat[]
  history: HistoryState
  avoidPrev: boolean
  decayFactor: number
  iterations: number
  seed: string
}): ProbMatrix {
  const { students, seats, iterations, seed, ...rest } = opts
  if (!(Number.isInteger(iterations) && iterations > 0)) {
    throw new Error(`iterations는 양의 정수여야 합니다: ${iterations}`)
  }
  const count: Record<string, Record<string, number>> = {}
  for (const s of students) {
    count[s.id] = {}
    for (const t of seats) count[s.id][t.id] = 0
  }
  for (let i = 0; i < iterations; i++) {
    const { arrangement } = drawAssignment({ students, seats, ...rest, seed: `${seed}:mc:${i}` })
    for (const [studentId, seatId] of Object.entries(arrangement)) count[studentId][seatId]++
  }
  const matrix: ProbMatrix = {}
  for (const s of students) {
    matrix[s.id] = {}
    for (const t of seats) matrix[s.id][t.id] = count[s.id][t.id] / iterations
  }
  return matrix
}
```

Run: `npx vitest run src/lib/montecarlo.test.ts` → Expected: PASS (수 초 소요 가능)

- [ ] **Step 3: Commit**

```bash
git add src/lib/montecarlo.ts src/lib/montecarlo.test.ts
git commit -m "feat: 몬테카를로 확률 추정 (결정론적 시드)"
```

---

### Task 8: 통계 검증 스위트 (전문가 수준 알고리즘 검증)

**Files:**
- Create: `tests/statistical.test.ts`

**Interfaces:**
- Consumes: `draw.ts`, `montecarlo.ts`, `seats.ts`
- Produces: 알고리즘의 통계적 성질을 증명하는 테스트 (외부 전문가 리뷰의 근거 자료)

**검증 항목:** ① 이력 없음 → 균등분포 (카이제곱 적합도 검정, df=26, α=0.001) ② 교환 가능성(같은 이력의 학생들은 같은 분포) ③ 감소 효과의 단조성 (2회 앉음 < 1회 앉음 < 안 앉음) ④ 전 과정 재현성 (기록된 시드로 완전 재현)

- [ ] **Step 1: 테스트 작성 (구현이 이미 있으므로 바로 PASS해야 함 — 실패하면 알고리즘 버그)**

`tests/statistical.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { drawAssignment } from '@/lib/draw'
import { estimateProbabilities } from '@/lib/montecarlo'
import { SEATS } from '@/lib/seats'
import type { HistoryState, Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${i + 1}`,
}))
const emptyHistory: HistoryState = { counts: {}, current: null }
const base = { students, seats: SEATS, history: emptyHistory, avoidPrev: false, decayFactor: 0.5 }

// 카이제곱 임계값: df=26, α=0.001 → 54.052
// 시드 고정 몬테카를로라 테스트는 결정론적 (플레이키 아님)
const CHI2_CRIT_DF26_A001 = 54.052
const N = 20000

describe('통계 검증: 균등성', () => {
  it('이력 없음 → 각 학생의 좌석 분포가 균등 (카이제곱 df=26, α=0.001)', () => {
    const p = estimateProbabilities({ ...base, iterations: N, seed: 'stat:uniform' })
    const expected = N / 27
    for (const s of students.slice(0, 5)) { // 대표 5명 (전원 검사는 느리기만 하고 정보량 동일)
      const chi2 = SEATS.reduce((acc, t) => {
        const observed = p[s.id][t.id] * N
        return acc + (observed - expected) ** 2 / expected
      }, 0)
      expect(chi2).toBeLessThan(CHI2_CRIT_DF26_A001)
    }
  })

  it('교환 가능성: 이력이 동일한 두 학생의 특정 좌석 확률이 통계 오차 내 일치', () => {
    const p = estimateProbabilities({ ...base, iterations: N, seed: 'stat:exch' })
    // 이력이 없으면 모든 학생이 대칭 → 같은 좌석 확률 차이는 표본오차(4σ ≈ 0.0053) 이내
    const seat = '2-3-L'
    const probs = students.map(s => p[s.id][seat])
    const max = Math.max(...probs)
    const min = Math.min(...probs)
    expect(max - min).toBeLessThan(0.011) // 두 추정치 차의 4σ ≈ 2 × 0.0053
  })
})

describe('통계 검증: 감소 효과', () => {
  it('앉은 횟수가 많을수록 확률이 단조 감소', () => {
    const history: HistoryState = {
      counts: { '2501': { '1-1-L': 2, '1-2-L': 1 } },
      current: null,
    }
    const p = estimateProbabilities({ ...base, history, iterations: N, seed: 'stat:mono' })
    const twice = p['2501']['1-1-L']
    const once = p['2501']['1-2-L']
    const never = p['2501']['3-4-L']
    expect(twice).toBeLessThan(once)
    expect(once).toBeLessThan(never)
  })

  it('감소 계수를 완만하게(0.9) 하면 페널티도 완만해짐', () => {
    const history: HistoryState = { counts: { '2501': { '1-1-L': 1 } }, current: null }
    const strict = estimateProbabilities({ ...base, history, iterations: N, seed: 'stat:df' })
    const lenient = estimateProbabilities({ ...base, history, decayFactor: 0.9, iterations: N, seed: 'stat:df' })
    expect(strict['2501']['1-1-L']).toBeLessThan(lenient['2501']['1-1-L'])
  })
})

describe('통계 검증: 재현성 (감사 절차)', () => {
  it('로그에 기록될 (시드, 옵션, 이력)만으로 배정 전체를 재현할 수 있다', () => {
    // 셔플 3회 시뮬레이션: 매회 직전 결과가 이력이 됨
    let history: HistoryState = { counts: {}, current: null }
    for (let round = 0; round < 3; round++) {
      const seed = `audit-round-${round}`
      const official = drawAssignment({ ...base, history, avoidPrev: round > 0, seed })
      // 감사자 재현: 같은 공개 정보로 재실행
      const replay = drawAssignment({ ...base, history, avoidPrev: round > 0, seed })
      expect(replay.arrangement).toEqual(official.arrangement)
      expect(replay.redrawCount).toBe(official.redrawCount)
      // 다음 라운드 이력 구성
      const counts: HistoryState['counts'] = JSON.parse(JSON.stringify(history.counts))
      for (const [sid, tid] of Object.entries(official.arrangement)) {
        counts[sid] ??= {}
        counts[sid][tid] = (counts[sid][tid] ?? 0) + 1
      }
      history = { counts, current: official.arrangement }
    }
  })
})
```

- [ ] **Step 2: 실행 확인**

Run: `npx vitest run tests/statistical.test.ts` → Expected: PASS (몬테카를로 여러 판이라 10~30초 걸릴 수 있음)

실패하는 항목이 있으면 **테스트를 고치지 말고 알고리즘 구현을 의심할 것** (이 스위트가 전문가 리뷰의 근거).

- [ ] **Step 3: Commit**

```bash
git add tests/statistical.test.ts
git commit -m "test: 통계 검증 스위트 (카이제곱 균등성/교환가능성/단조감소/재현성)"
```

---

### Task 9: Supabase 스키마 + DB 레이어

**Files:**
- Create: `supabase/migrations/001_init.sql`, `src/lib/supabase.ts`, `src/lib/db.ts`, `src/lib/db.test.ts`

**Interfaces:**
- Consumes: `history.ts`의 `SessionRow`, `AssignmentRow`
- Produces (`db.ts`, 전부 async):
  - `fetchHistoryRows(): Promise<{ sessions: SessionRow[]; assignments: AssignmentRow[] }>`
  - `fetchSessionsWithAssignments(): Promise<SessionDetail[]>` — `SessionDetail = SessionRow & { executed_by: string; avoid_prev: boolean | null; seed: string | null; redraw_count: number; prob_snapshot: ProbMatrix | null; assignments: AssignmentRow[] }`
  - `insertShuffleSession(p: { executedBy: string; avoidPrev: boolean; seed: string; redrawCount: number; probSnapshot: ProbMatrix; arrangement: Arrangement }): Promise<string>`
  - `insertSwapSession(p: { executedBy: string; entries: Array<{ studentId: string; seatId: string }> }): Promise<string>`
  - `setSessionInvalidated(sessionId: string): Promise<void>`
  - `countRecentPinFailures(ip: string, windowMinutes: number): Promise<number>`
  - `recordPinAttempt(ip: string, success: boolean): Promise<void>`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/001_init.sql`:

```sql
-- EB Change Seat 초기 스키마
-- 로그는 append-only: UPDATE는 invalidated 플래그만, DELETE 없음.

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  type          text not null check (type in ('shuffle', 'swap')),
  executed_by   text not null check (char_length(executed_by) between 1 and 20),
  avoid_prev    boolean,          -- shuffle만
  seed          text,             -- shuffle만, 공개 난수 시드
  redraw_count  int not null default 0,
  prob_snapshot jsonb,            -- shuffle만, 셔플 직전 확률 행렬
  invalidated   boolean not null default false
);

create table assignments (
  id          bigint generated always as identity primary key,
  session_id  uuid not null references sessions(id),
  student_id  text not null,
  seat_id     text not null
);
create index assignments_session_idx on assignments(session_id);

create table pin_attempts (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  ip          text not null,
  success     boolean not null
);
create index pin_attempts_ip_time_idx on pin_attempts(ip, created_at);

-- 접근은 서버의 service-role 키로만. RLS를 켜고 공개 정책은 만들지 않는다.
alter table sessions enable row level security;
alter table assignments enable row level security;
alter table pin_attempts enable row level security;
```

- [ ] **Step 2: 마이그레이션 적용**

Supabase MCP가 연결되어 있으면 `apply_migration`(name: `init`, 위 SQL)으로 적용. 아니면 Supabase 대시보드 SQL Editor에 붙여넣어 실행. 적용 후 `list_tables`로 3개 테이블 확인.

`.env.local` 생성 (커밋 금지 — `.gitignore` 확인):

```bash
SUPABASE_URL=<프로젝트 URL>
SUPABASE_SERVICE_ROLE_KEY=<service_role 키>
SHUFFLE_PIN=0119
```

- [ ] **Step 3: supabase 클라이언트**

`src/lib/supabase.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** 서버 전용. service-role 키는 절대 클라이언트 번들에 노출 금지. */
export function supabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경 변수가 없습니다')
  return createClient(url, key, { auth: { persistSession: false } })
}
```

- [ ] **Step 4: 실패하는 db 매핑 테스트 작성**

DB 왕복은 얇게 유지하고, 순수 매핑 로직만 단위 테스트한다.

`src/lib/db.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { arrangementToRows } from '@/lib/db'

describe('arrangementToRows', () => {
  it('Arrangement → assignments 행 배열', () => {
    const rows = arrangementToRows('sess-1', { a: '1-1-L', b: '1-1-R' })
    expect(rows).toEqual([
      { session_id: 'sess-1', student_id: 'a', seat_id: '1-1-L' },
      { session_id: 'sess-1', student_id: 'b', seat_id: '1-1-R' },
    ])
  })
})
```

Run: `npx vitest run src/lib/db.test.ts` → Expected: FAIL

- [ ] **Step 5: db 레이어 구현**

`src/lib/db.ts`:

```ts
import { supabaseAdmin } from './supabase'
import type { AssignmentRow, SessionRow } from './history'
import type { Arrangement, ProbMatrix } from './types'

export interface SessionDetail extends SessionRow {
  executed_by: string
  avoid_prev: boolean | null
  seed: string | null
  redraw_count: number
  prob_snapshot: ProbMatrix | null
  assignments: AssignmentRow[]
}

export function arrangementToRows(sessionId: string, arrangement: Arrangement): AssignmentRow[] {
  return Object.entries(arrangement).map(([student_id, seat_id]) => ({
    session_id: sessionId,
    student_id,
    seat_id,
  }))
}

export async function fetchHistoryRows(): Promise<{ sessions: SessionRow[]; assignments: AssignmentRow[] }> {
  const db = supabaseAdmin()
  const [sessions, assignments] = await Promise.all([
    db.from('sessions').select('id, created_at, type, invalidated'),
    db.from('assignments').select('session_id, student_id, seat_id'),
  ])
  if (sessions.error) throw sessions.error
  if (assignments.error) throw assignments.error
  return { sessions: sessions.data as SessionRow[], assignments: assignments.data as AssignmentRow[] }
}

export async function fetchSessionsWithAssignments(): Promise<SessionDetail[]> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('sessions')
    .select('*, assignments(session_id, student_id, seat_id)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as unknown as SessionDetail[]
}

export async function insertShuffleSession(p: {
  executedBy: string
  avoidPrev: boolean
  seed: string
  redrawCount: number
  probSnapshot: ProbMatrix
  arrangement: Arrangement
}): Promise<string> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('sessions')
    .insert({
      type: 'shuffle',
      executed_by: p.executedBy,
      avoid_prev: p.avoidPrev,
      seed: p.seed,
      redraw_count: p.redrawCount,
      prob_snapshot: p.probSnapshot,
    })
    .select('id')
    .single()
  if (error) throw error
  const { error: aErr } = await db.from('assignments').insert(arrangementToRows(data.id, p.arrangement))
  if (aErr) throw aErr
  return data.id
}

export async function insertSwapSession(p: {
  executedBy: string
  entries: Array<{ studentId: string; seatId: string }>
}): Promise<string> {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('sessions')
    .insert({ type: 'swap', executed_by: p.executedBy })
    .select('id')
    .single()
  if (error) throw error
  const { error: aErr } = await db.from('assignments').insert(
    p.entries.map(e => ({ session_id: data.id, student_id: e.studentId, seat_id: e.seatId })),
  )
  if (aErr) throw aErr
  return data.id
}

export async function setSessionInvalidated(sessionId: string): Promise<void> {
  const db = supabaseAdmin()
  const { error } = await db.from('sessions').update({ invalidated: true }).eq('id', sessionId)
  if (error) throw error
}

export async function countRecentPinFailures(ip: string, windowMinutes: number): Promise<number> {
  const db = supabaseAdmin()
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString()
  const { count, error } = await db
    .from('pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('created_at', since)
  if (error) throw error
  return count ?? 0
}

export async function recordPinAttempt(ip: string, success: boolean): Promise<void> {
  const db = supabaseAdmin()
  const { error } = await db.from('pin_attempts').insert({ ip, success })
  if (error) throw error
}
```

Run: `npx vitest run src/lib/db.test.ts` → Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/001_init.sql src/lib/supabase.ts src/lib/db.ts src/lib/db.test.ts
git commit -m "feat: Supabase 스키마(append-only) + DB 레이어"
```

---

### Task 10: PIN 인증 + 레이트리밋

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth.test.ts`

**Interfaces:**
- Consumes: `db.ts`(`countRecentPinFailures`, `recordPinAttempt`)
- Produces: `verifyPin(input: string): boolean`, `checkAndRecordPin(ip: string, pin: string): Promise<'ok' | 'rate_limited' | 'wrong_pin'>`, 상수 `RATE_LIMIT = { maxFailures: 5, windowMinutes: 10 }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/auth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({
  countRecentPinFailures: vi.fn(),
  recordPinAttempt: vi.fn(),
}))

import { checkAndRecordPin, verifyPin } from '@/lib/auth'
import { countRecentPinFailures, recordPinAttempt } from '@/lib/db'

beforeEach(() => {
  vi.stubEnv('SHUFFLE_PIN', '0119')
  vi.mocked(countRecentPinFailures).mockResolvedValue(0)
  vi.mocked(recordPinAttempt).mockResolvedValue()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('verifyPin', () => {
  it('일치 → true, 불일치/길이 다름 → false', () => {
    expect(verifyPin('0119')).toBe(true)
    expect(verifyPin('0000')).toBe(false)
    expect(verifyPin('01190')).toBe(false)
    expect(verifyPin('')).toBe(false)
  })
  it('SHUFFLE_PIN 미설정 → 에러 (조용한 통과 금지)', () => {
    vi.stubEnv('SHUFFLE_PIN', '')
    expect(() => verifyPin('0119')).toThrow()
  })
})

describe('checkAndRecordPin', () => {
  it('올바른 PIN → ok, 성공 시도 기록', async () => {
    await expect(checkAndRecordPin('1.2.3.4', '0119')).resolves.toBe('ok')
    expect(recordPinAttempt).toHaveBeenCalledWith('1.2.3.4', true)
  })
  it('틀린 PIN → wrong_pin, 실패 시도 기록', async () => {
    await expect(checkAndRecordPin('1.2.3.4', '9999')).resolves.toBe('wrong_pin')
    expect(recordPinAttempt).toHaveBeenCalledWith('1.2.3.4', false)
  })
  it('최근 실패 5회 이상 → rate_limited, PIN 검증 자체를 건너뜀', async () => {
    vi.mocked(countRecentPinFailures).mockResolvedValue(5)
    await expect(checkAndRecordPin('1.2.3.4', '0119')).resolves.toBe('rate_limited')
    expect(recordPinAttempt).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run src/lib/auth.test.ts` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/lib/auth.ts`:

```ts
import { timingSafeEqual } from 'crypto'
import { countRecentPinFailures, recordPinAttempt } from './db'

export const RATE_LIMIT = { maxFailures: 5, windowMinutes: 10 }

/** 타이밍 공격에 안전한 PIN 비교. */
export function verifyPin(input: string): boolean {
  const expected = process.env.SHUFFLE_PIN
  if (!expected) throw new Error('SHUFFLE_PIN 환경 변수가 설정되지 않았습니다')
  const a = Buffer.from(String(input))
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** 레이트리밋 확인 → PIN 검증 → 시도 기록. 모든 변경 API의 관문. */
export async function checkAndRecordPin(ip: string, pin: string): Promise<'ok' | 'rate_limited' | 'wrong_pin'> {
  const failures = await countRecentPinFailures(ip, RATE_LIMIT.windowMinutes)
  if (failures >= RATE_LIMIT.maxFailures) return 'rate_limited'
  const ok = verifyPin(pin)
  await recordPinAttempt(ip, ok)
  return ok ? 'ok' : 'wrong_pin'
}
```

Run: `npx vitest run src/lib/auth.test.ts` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: timing-safe PIN 검증 + 시도 레이트리밋"
```

---

### Task 11: API 라우트 4종

**Files:**
- Create: `src/app/api/shuffle/route.ts`, `src/app/api/swap/route.ts`, `src/app/api/invalidate/route.ts`, `src/app/api/probabilities/route.ts`, `src/app/api/shuffle/route.test.ts`

**Interfaces:**
- Consumes: 위의 모든 lib 모듈
- Produces (HTTP 계약 — UI 태스크들이 이 형태에 의존):
  - `POST /api/shuffle` body `{ executedBy: string; pin: string; avoidPrev: boolean }` → 200 `{ arrangement, seed, redrawCount }` | 400 | 401 `{ error: 'wrong_pin' }` | 429 `{ error: 'rate_limited' }`
  - `POST /api/swap` body `{ executedBy: string; pin: string; studentA: string; studentB: string }` → 200 `{ arrangement }` | 400 | 401 | 409 `{ error: 'no_arrangement' }` | 429
  - `POST /api/invalidate` body `{ pin: string; sessionId: string }` → 200 `{ ok: true }` | 400 | 401 | 429
  - `GET /api/probabilities?avoidPrev=true|false` → 200 `{ probabilities: ProbMatrix }` (인증 없음)

- [ ] **Step 1: 공통 헬퍼와 shuffle 라우트의 실패하는 테스트 작성**

`src/app/api/shuffle/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  fetchHistoryRows: vi.fn().mockResolvedValue({ sessions: [], assignments: [] }),
  insertShuffleSession: vi.fn().mockResolvedValue('sess-1'),
  countRecentPinFailures: vi.fn().mockResolvedValue(0),
  recordPinAttempt: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from '@/app/api/shuffle/route'
import { insertShuffleSession } from '@/lib/db'

function req(body: unknown): Request {
  return new Request('http://test/api/shuffle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv('SHUFFLE_PIN', '0119')
  vi.clearAllMocks()
})

describe('POST /api/shuffle', () => {
  it('정상 요청 → 200, 27명 배정 + 시드 반환, 세션 저장', async () => {
    const res = await POST(req({ executedBy: '김철수', pin: '0119', avoidPrev: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Object.keys(json.arrangement)).toHaveLength(27)
    expect(json.seed).toMatch(/^[0-9a-f]{32}$/)
    expect(insertShuffleSession).toHaveBeenCalledOnce()
  })
  it('PIN 불일치 → 401', async () => {
    const res = await POST(req({ executedBy: '김철수', pin: '9999', avoidPrev: false }))
    expect(res.status).toBe(401)
  })
  it('이름 누락/공백 → 400', async () => {
    const res = await POST(req({ executedBy: '  ', pin: '0119', avoidPrev: false }))
    expect(res.status).toBe(400)
  })
  it('본문이 JSON이 아니면 400', async () => {
    const res = await POST(new Request('http://test', { method: 'POST', body: 'x' }))
    expect(res.status).toBe(400)
  })
})
```

Run: `npx vitest run src/app/api/shuffle/route.test.ts` → Expected: FAIL

- [ ] **Step 2: shuffle 라우트 구현**

`src/app/api/shuffle/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { config } from '@/config'
import { checkAndRecordPin } from '@/lib/auth'
import { drawAssignment } from '@/lib/draw'
import { fetchHistoryRows, insertShuffleSession } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { estimateProbabilities } from '@/lib/montecarlo'
import { loadStudents } from '@/lib/roster'
import { generateSeed } from '@/lib/rng'
import { SEATS } from '@/lib/seats'

export const dynamic = 'force-dynamic'

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const executedBy = typeof body?.executedBy === 'string' ? body.executedBy.trim() : ''
  if (!executedBy || executedBy.length > 20 || typeof body?.pin !== 'string' || typeof body?.avoidPrev !== 'boolean') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const auth = await checkAndRecordPin(clientIp(req), body.pin)
  if (auth === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (auth === 'wrong_pin') return NextResponse.json({ error: 'wrong_pin' }, { status: 401 })

  const students = loadStudents()
  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)

  const seed = generateSeed()
  // 셔플 직전 확률 스냅샷: 이 셔플과 같은 조건, 시드는 루트 시드에서 파생 → 스냅샷도 재현 가능
  const probSnapshot = estimateProbabilities({
    students, seats: SEATS, history,
    avoidPrev: body.avoidPrev, decayFactor: config.decayFactor,
    iterations: config.mcIterations, seed: `${seed}:snapshot`,
  })
  const result = drawAssignment({
    students, seats: SEATS, history,
    avoidPrev: body.avoidPrev, decayFactor: config.decayFactor,
    seed, maxRedraws: config.maxRedraws,
  })

  await insertShuffleSession({
    executedBy, avoidPrev: body.avoidPrev, seed: result.seed,
    redrawCount: result.redrawCount, probSnapshot, arrangement: result.arrangement,
  })

  return NextResponse.json({
    arrangement: result.arrangement,
    seed: result.seed,
    redrawCount: result.redrawCount,
  })
}
```

Run: `npx vitest run src/app/api/shuffle/route.test.ts` → Expected: PASS

- [ ] **Step 3: swap / invalidate / probabilities 라우트 구현**

`src/app/api/swap/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { checkAndRecordPin } from '@/lib/auth'
import { fetchHistoryRows, insertSwapSession } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { loadStudents } from '@/lib/roster'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const executedBy = typeof body?.executedBy === 'string' ? body.executedBy.trim() : ''
  const { studentA, studentB } = body ?? {}
  if (
    !executedBy || executedBy.length > 20 || typeof body?.pin !== 'string' ||
    typeof studentA !== 'string' || typeof studentB !== 'string' || studentA === studentB
  ) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const roster = new Set(loadStudents().map(s => s.id))
  if (!roster.has(studentA) || !roster.has(studentB)) {
    return NextResponse.json({ error: 'unknown_student' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const auth = await checkAndRecordPin(ip, body.pin)
  if (auth === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (auth === 'wrong_pin') return NextResponse.json({ error: 'wrong_pin' }, { status: 401 })

  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)
  if (!history.current) return NextResponse.json({ error: 'no_arrangement' }, { status: 409 })

  const seatA = history.current[studentA]
  const seatB = history.current[studentB]
  await insertSwapSession({
    executedBy,
    entries: [
      { studentId: studentA, seatId: seatB },
      { studentId: studentB, seatId: seatA },
    ],
  })
  return NextResponse.json({ arrangement: { ...history.current, [studentA]: seatB, [studentB]: seatA } })
}
```

`src/app/api/invalidate/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { checkAndRecordPin } from '@/lib/auth'
import { setSessionInvalidated } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (typeof body?.pin !== 'string' || typeof body?.sessionId !== 'string' || !body.sessionId) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const auth = await checkAndRecordPin(ip, body.pin)
  if (auth === 'rate_limited') return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  if (auth === 'wrong_pin') return NextResponse.json({ error: 'wrong_pin' }, { status: 401 })

  await setSessionInvalidated(body.sessionId)
  return NextResponse.json({ ok: true })
}
```

`src/app/api/probabilities/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { config } from '@/config'
import { fetchHistoryRows } from '@/lib/db'
import { deriveHistory } from '@/lib/history'
import { estimateProbabilities } from '@/lib/montecarlo'
import { generateSeed } from '@/lib/rng'
import { loadStudents } from '@/lib/roster'
import { SEATS } from '@/lib/seats'

export const dynamic = 'force-dynamic'

/** 다음 셔플 기준 확률. 조회는 공개 (PIN 불필요). */
export async function GET(req: Request) {
  const avoidPrev = new URL(req.url).searchParams.get('avoidPrev') === 'true'
  const students = loadStudents()
  const { sessions, assignments } = await fetchHistoryRows()
  const history = deriveHistory(sessions, assignments)
  const probabilities = estimateProbabilities({
    students, seats: SEATS, history, avoidPrev,
    decayFactor: config.decayFactor, iterations: config.mcIterations, seed: generateSeed(),
  })
  return NextResponse.json({ probabilities })
}
```

- [ ] **Step 4: 전체 테스트 + 빌드 확인**

Run: `npm test` → Expected: 전부 PASS
Run: `npm run build` → Expected: 성공

- [ ] **Step 5: Commit**

```bash
git add src/app/api
git commit -m "feat: shuffle/swap/invalidate/probabilities API"
```

---

### Task 12: 메인 페이지 — SeatMap + 현재 배치

**Files:**
- Create: `src/components/SeatMap.tsx`, `src/components/SeatMap.test.tsx`, `src/components/ClassroomView.tsx`
- Modify: `src/app/page.tsx` (스캐폴드 기본 내용 교체), `src/app/layout.tsx` (title/lang만 수정)

**Interfaces:**
- Consumes: `db.ts`(`fetchHistoryRows`), `history.ts`, `roster.ts`, `seats.ts`
- Produces:
  - `SeatMap` props: `{ students: Student[]; arrangement: Arrangement | null; probRow?: Record<string, number> | null; selectedStudentId?: string | null; swapPicks?: string[]; revealKey?: number; onSeatClick?: (seatId: string, occupantId: string | null) => void }`
  - `ClassroomView` props: `{ students: Student[]; initialArrangement: Arrangement | null; latestInfo: { executedBy: string; createdAt: string } | null }` — 이후 태스크(13~15)가 이 컴포넌트에 컨트롤을 추가

- [ ] **Step 1: 실패하는 SeatMap 테스트 작성**

`src/components/SeatMap.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SeatMap } from '@/components/SeatMap'
import type { Student } from '@/lib/types'

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${String(i + 1).padStart(2, '0')}`,
}))

describe('SeatMap', () => {
  it('교탁과 27개 좌석을 렌더링', () => {
    render(<SeatMap students={students} arrangement={null} />)
    expect(screen.getByText('교탁')).toBeInTheDocument()
    expect(screen.getAllByTestId('seat')).toHaveLength(27)
  })
  it('배치가 있으면 좌석에 학생 이름 표시', () => {
    const arrangement = Object.fromEntries(students.map((s, i) => [s.id, ['1-1-L', '1-1-R', '1-2-L'][i] ?? `x-${i}`]))
    render(<SeatMap students={students} arrangement={{ '2501': '1-1-L' } as never} />)
    expect(screen.getByText('학생01')).toBeInTheDocument()
    void arrangement
  })
  it('고정석 학생에게 고정 배지 표시', () => {
    const withFixed = students.map((s, i) => (i === 0 ? { ...s, fixedSeatId: '1-1-L' } : s))
    render(<SeatMap students={withFixed} arrangement={{ '2501': '1-1-L' }} />)
    expect(screen.getByText('고정')).toBeInTheDocument()
  })
  it('확률 행이 주어지면 퍼센트 표시', () => {
    render(<SeatMap students={students} arrangement={null} probRow={{ '1-1-L': 0.0512 }} selectedStudentId="2501" />)
    expect(screen.getByText('5.1%')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/components/SeatMap.test.tsx` → Expected: FAIL

- [ ] **Step 2: SeatMap 구현**

`src/components/SeatMap.tsx`:

```tsx
'use client'

import { SEATS } from '@/lib/seats'
import type { Arrangement, Student } from '@/lib/types'

interface Props {
  students: Student[]
  arrangement: Arrangement | null
  probRow?: Record<string, number> | null
  selectedStudentId?: string | null
  swapPicks?: string[]
  revealKey?: number
  onSeatClick?: (seatId: string, occupantId: string | null) => void
}

export function SeatMap({
  students, arrangement, probRow, selectedStudentId, swapPicks = [], revealKey = 0, onSeatClick,
}: Props) {
  const byId = new Map(students.map(s => [s.id, s]))
  const seatToStudent = new Map<string, string>()
  if (arrangement) for (const [sid, seat] of Object.entries(arrangement)) seatToStudent.set(seat, sid)
  const maxProb = probRow ? Math.max(...Object.values(probRow), 1e-9) : 1

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-4">
        <div className="mx-auto w-44 rounded border-2 border-gray-500 py-2 text-center text-sm font-bold dark:border-gray-300">
          교탁
        </div>
        <div className="flex justify-center gap-8">
          {([1, 2, 3] as const).map(block => (
            <div key={block} className="grid grid-cols-2 gap-2">
              {SEATS.filter(s => s.block === block).map(seat => {
                const occupantId = seatToStudent.get(seat.id) ?? null
                const occupant = occupantId ? byId.get(occupantId) : null
                const prob = probRow?.[seat.id]
                const isSelected = !!occupantId && occupantId === selectedStudentId
                const isPicked = !!occupantId && swapPicks.includes(occupantId)
                return (
                  <button
                    key={`${seat.id}-${revealKey}`}
                    type="button"
                    data-testid="seat"
                    onClick={() => onSeatClick?.(seat.id, occupantId)}
                    style={{
                      gridColumnStart: seat.col === 'L' ? 1 : 2,
                      gridRowStart: seat.row,
                      backgroundColor: prob !== undefined
                        ? `rgba(59, 130, 246, ${(prob / maxProb) * 0.75})`
                        : undefined,
                      animationDelay: `${(seat.row * 3 + seat.block) * 60}ms`,
                    }}
                    className={`h-16 w-24 rounded border p-1 text-center text-xs transition
                      ${isSelected ? 'ring-2 ring-blue-500' : ''}
                      ${isPicked ? 'ring-2 ring-amber-500' : ''}
                      ${revealKey > 0 ? 'animate-[seat-reveal_.4s_ease-out_both]' : ''}
                      border-gray-300 dark:border-gray-600`}
                  >
                    {occupant ? (
                      <span className="block">
                        <span className="block truncate font-semibold">{occupant.name}</span>
                        <span className="block text-[10px] opacity-60">{occupant.id}</span>
                        {occupant.fixedSeatId === seat.id && (
                          <span className="rounded bg-amber-200 px-1 text-[10px] text-amber-900">고정</span>
                        )}
                      </span>
                    ) : (
                      <span className="opacity-40">{seat.id}</span>
                    )}
                    {prob !== undefined && (
                      <span className="block text-[10px] font-bold">{(prob * 100).toFixed(1)}%</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

`src/app/globals.css`에 애니메이션 키프레임 추가:

```css
@keyframes seat-reveal {
  from { opacity: 0; transform: rotateY(90deg); }
  to { opacity: 1; transform: rotateY(0); }
}
```

Run: `npx vitest run src/components/SeatMap.test.tsx` → Expected: PASS

- [ ] **Step 3: ClassroomView 뼈대 + 페이지 연결**

`src/components/ClassroomView.tsx` (이후 태스크에서 컨트롤 추가되는 골격):

```tsx
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
```

`src/app/page.tsx`:

```tsx
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
  // executed_by는 fetchHistoryRows에 포함되지 않으므로 표시용으로 별도 조회하거나
  // fetchHistoryRows의 select에 executed_by를 추가한다 (구현 시 select 컬럼에 executed_by 추가 권장)
  return (
    <ClassroomView
      students={students}
      initialArrangement={history.current}
      latestInfo={latest ? { executedBy: (latest as { executed_by?: string }).executed_by ?? '', createdAt: latest.created_at } : null}
    />
  )
}
```

주의: `fetchHistoryRows`의 sessions select에 `executed_by` 컬럼을 추가하고 `SessionRow`에 옵션 필드로 반영할 것 (Task 9 코드에 `executed_by`를 select 목록에 추가하는 한 줄 수정 — `'id, created_at, type, invalidated, executed_by'`).

`src/app/layout.tsx`: `lang="ko"`, `<title>EB 자리 배정</title>`, description "투명한 랜덤 자리 배정 — 확률·시드·로그 전체 공개" 로 수정.

- [ ] **Step 4: 확인 + 커밋**

Run: `npm test` → Expected: PASS
Run: `npm run build` → Expected: 성공
Run: `npm run dev` 후 http://localhost:3000 에서 교탁 + 27석(빈 좌석) 렌더 확인

```bash
git add src/components src/app/page.tsx src/app/layout.tsx src/app/globals.css src/lib/db.ts src/lib/history.ts
git commit -m "feat: 좌석 배치도 + 메인 페이지 (현재 배치 표시)"
```

---

### Task 13: 셔플 컨트롤 + 공개 애니메이션

**Files:**
- Create: `src/components/ShuffleControls.tsx`, `src/components/ShuffleControls.test.tsx`
- Modify: `src/components/ClassroomView.tsx`

**Interfaces:**
- Consumes: `POST /api/shuffle` HTTP 계약 (Task 11)
- Produces: `ShuffleControls` props `{ avoidPrev: boolean; onAvoidPrevChange: (v: boolean) => void; onResult: (arrangement: Arrangement) => void }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ShuffleControls.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShuffleControls } from '@/components/ShuffleControls'

afterEach(() => vi.restoreAllMocks())

function setup(onResult = vi.fn()) {
  render(<ShuffleControls avoidPrev={false} onAvoidPrevChange={vi.fn()} onResult={onResult} />)
  return onResult
}

describe('ShuffleControls', () => {
  it('이름과 PIN을 입력해 실행하면 응답 배치를 onResult로 전달', async () => {
    const arrangement = { '2501': '1-1-L' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ arrangement, seed: 'x', redrawCount: 0 }), { status: 200 }),
    ))
    const onResult = setup()
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '0119')
    await userEvent.click(screen.getByRole('button', { name: /전체 자리 배정 실행/ }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(arrangement))
  })
  it('401 → PIN 오류 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'wrong_pin' }), { status: 401 }),
    ))
    setup()
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '9999')
    await userEvent.click(screen.getByRole('button', { name: /전체 자리 배정 실행/ }))
    expect(await screen.findByText('PIN이 올바르지 않습니다')).toBeInTheDocument()
  })
  it('429 → 시도 초과 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 }),
    ))
    setup()
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '0119')
    await userEvent.click(screen.getByRole('button', { name: /전체 자리 배정 실행/ }))
    expect(await screen.findByText(/시도 횟수를 초과/)).toBeInTheDocument()
  })
  it('이름이 비어있으면 실행 버튼 비활성', async () => {
    setup()
    expect(screen.getByRole('button', { name: /전체 자리 배정 실행/ })).toBeDisabled()
  })
})
```

Run: `npx vitest run src/components/ShuffleControls.test.tsx` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/components/ShuffleControls.tsx`:

```tsx
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
        자동으로 낮아지며(감소계수 {`0.5`}ⁿ), 정확한 확률은 각 학생을 클릭해 확인할 수 있습니다.
      </p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </section>
  )
}
```

`ClassroomView.tsx` 수정 — 상태와 콜백 연결:

```tsx
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SeatMap } from './SeatMap'
import { ShuffleControls } from './ShuffleControls'
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
  const router = useRouter()
  const [arrangement, setArrangement] = useState<Arrangement | null>(initialArrangement)
  const [avoidPrev, setAvoidPrev] = useState(true)
  const [revealKey, setRevealKey] = useState(0)

  const handleShuffleResult = useCallback((next: Arrangement) => {
    setArrangement(next)
    setRevealKey(k => k + 1) // 카드 뒤집기 연출 재생
    router.refresh()
  }, [router])

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      {/* 기존 header 유지 */}
      <ShuffleControls avoidPrev={avoidPrev} onAvoidPrevChange={setAvoidPrev} onResult={handleShuffleResult} />
      <SeatMap students={students} arrangement={arrangement} revealKey={revealKey} />
    </main>
  )
}
```

Run: `npx vitest run src/components/ShuffleControls.test.tsx` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components
git commit -m "feat: 셔플 컨트롤 (이름/PIN/토글) + 공개 애니메이션"
```

---

### Task 14: 확률 오버레이

**Files:**
- Create: `src/components/probability.test.tsx`
- Modify: `src/components/ClassroomView.tsx`

**Interfaces:**
- Consumes: `GET /api/probabilities?avoidPrev=` HTTP 계약, `SeatMap`의 `probRow`/`selectedStudentId`/`onSeatClick` props
- Produces: 좌석(학생) 클릭 → 해당 학생 확률 오버레이 토글. 배치가 없을 땐 학생 칩 목록으로 선택.

**동작 명세:**
- 학생 선택 시 확률 행렬이 없으면 `/api/probabilities?avoidPrev=<현재 토글>`을 가져와 캐시. 토글이 바뀌면 캐시 무효화.
- 같은 학생을 다시 클릭하면 선택 해제. 로딩 중 "확률 계산 중…" 표시.
- 배치가 아직 없으면(첫 셔플 전) 배치도 아래에 학생 이름 칩 27개를 렌더링해 선택 가능하게.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/probability.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClassroomView } from '@/components/ClassroomView'
import { SEAT_IDS } from '@/lib/seats'
import type { Student } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
afterEach(() => vi.restoreAllMocks())

const students: Student[] = Array.from({ length: 27 }, (_, i) => ({
  id: String(2501 + i),
  name: `학생${String(i + 1).padStart(2, '0')}`,
}))
const arrangement = Object.fromEntries(students.map((s, i) => [s.id, SEAT_IDS[i]]))

function mockProbabilities() {
  const row = Object.fromEntries(SEAT_IDS.map(id => [id, 1 / 27]))
  const probabilities = Object.fromEntries(students.map(s => [s.id, row]))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ probabilities }), { status: 200 }),
  ))
}

describe('확률 오버레이', () => {
  it('좌석 클릭 → 확률 API 호출 → 퍼센트 표시', async () => {
    mockProbabilities()
    render(<ClassroomView students={students} initialArrangement={arrangement} latestInfo={null} />)
    await userEvent.click(screen.getByText('학생01'))
    expect(await screen.findAllByText('3.7%')).not.toHaveLength(0)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/probabilities?avoidPrev='))
  })
  it('같은 학생 재클릭 → 오버레이 해제', async () => {
    mockProbabilities()
    render(<ClassroomView students={students} initialArrangement={arrangement} latestInfo={null} />)
    await userEvent.click(screen.getByText('학생01'))
    await screen.findAllByText('3.7%')
    await userEvent.click(screen.getByText('학생01'))
    expect(screen.queryByText('3.7%')).not.toBeInTheDocument()
  })
  it('배치가 없으면 학생 칩 목록으로 선택 가능', async () => {
    mockProbabilities()
    render(<ClassroomView students={students} initialArrangement={null} latestInfo={null} />)
    await userEvent.click(screen.getByRole('button', { name: '학생05' }))
    expect(await screen.findAllByText('3.7%')).not.toHaveLength(0)
  })
})
```

Run: `npx vitest run src/components/probability.test.tsx` → Expected: FAIL

- [ ] **Step 2: ClassroomView에 확률 상태 추가**

`ClassroomView.tsx`에 추가/수정 (전체 컴포넌트):

```tsx
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SeatMap } from './SeatMap'
import { ShuffleControls } from './ShuffleControls'
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
    setRevealKey(k => k + 1)
    setProbs(null) // 이력이 늘었으므로 확률 재계산 필요
    setSelectedStudentId(null)
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

      {selectedStudentId && (
        <p className="text-sm">
          <strong>{students.find(s => s.id === selectedStudentId)?.name}</strong>의 다음 셔플 자리별 확률
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
        revealKey={revealKey}
        onSeatClick={(_seatId, occupantId) => selectStudent(occupantId)}
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
```

Run: `npx vitest run src/components/probability.test.tsx src/components/ShuffleControls.test.tsx` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components
git commit -m "feat: 학생 클릭 확률 오버레이 (토글 연동 캐시)"
```

---

### Task 15: 자리 교환 모드

**Files:**
- Create: `src/components/SwapControls.tsx`, `src/components/SwapControls.test.tsx`
- Modify: `src/components/ClassroomView.tsx`

**Interfaces:**
- Consumes: `POST /api/swap` HTTP 계약, `SeatMap`의 `swapPicks` prop
- Produces: `SwapControls` props `{ picks: Student[]; onResult: (arrangement: Arrangement) => void; onCancel: () => void }`

**동작 명세:**
- ClassroomView에 "자리 바꾸기" 모드 버튼. 모드 중 좌석 클릭은 확률 대신 교환 대상 선택(최대 2명, 재클릭 해제).
- 2명이 선택되면 SwapControls에서 실행자 이름 + PIN 입력 후 실행 → 성공 시 배치 갱신·모드 종료. 오류 메시지는 ShuffleControls와 동일 규칙.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/SwapControls.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwapControls } from '@/components/SwapControls'

afterEach(() => vi.restoreAllMocks())

const picks = [
  { id: '2501', name: '학생01' },
  { id: '2502', name: '학생02' },
]

describe('SwapControls', () => {
  it('두 명 선택 + 이름/PIN 입력 → swap API 호출 → onResult', async () => {
    const arrangement = { '2501': '1-1-R', '2502': '1-1-L' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ arrangement }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const onResult = vi.fn()
    render(<SwapControls picks={picks} onResult={onResult} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '0119')
    await userEvent.click(screen.getByRole('button', { name: /교환 실행/ }))
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(arrangement))
    expect(fetchMock).toHaveBeenCalledWith('/api/swap', expect.objectContaining({ method: 'POST' }))
  })
  it('선택이 2명 미만이면 실행 버튼 비활성', () => {
    render(<SwapControls picks={[picks[0]]} onResult={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: /교환 실행/ })).toBeDisabled()
  })
  it('401 → PIN 오류 메시지', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'wrong_pin' }), { status: 401 }),
    ))
    render(<SwapControls picks={picks} onResult={vi.fn()} onCancel={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('이름'), '김철수')
    await userEvent.type(screen.getByLabelText('PIN'), '9999')
    await userEvent.click(screen.getByRole('button', { name: /교환 실행/ }))
    expect(await screen.findByText('PIN이 올바르지 않습니다')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/components/SwapControls.test.tsx` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/components/SwapControls.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Arrangement, Student } from '@/lib/types'

const ERROR_MESSAGES: Record<string, string> = {
  wrong_pin: 'PIN이 올바르지 않습니다',
  rate_limited: '시도 횟수를 초과했습니다. 10분 후 다시 시도하세요',
  no_arrangement: '아직 배정된 자리가 없습니다',
}

export function SwapControls({
  picks, onResult, onCancel,
}: {
  picks: Student[]
  onResult: (arrangement: Arrangement) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          executedBy: name.trim(), pin,
          studentA: picks[0].id, studentB: picks[1].id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(ERROR_MESSAGES[json.error] ?? '교환에 실패했습니다')
        return
      }
      onResult(json.arrangement)
    } catch {
      setError('네트워크 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-amber-400 p-4">
      <h2 className="font-bold">자리 바꾸기</h2>
      <p className="text-sm">
        선택: {picks.map(p => p.name).join(' ↔ ') || '배치도에서 두 명을 클릭하세요'}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          이름
          <input aria-label="이름" value={name} maxLength={20} onChange={e => setName(e.target.value)}
            className="mt-1 block w-32 rounded border px-2 py-1 dark:bg-gray-800" placeholder="실행자 이름" />
        </label>
        <label className="block text-sm">
          PIN
          <input aria-label="PIN" value={pin} type="password" inputMode="numeric" maxLength={6}
            onChange={e => setPin(e.target.value)}
            className="mt-1 block w-24 rounded border px-2 py-1 dark:bg-gray-800" placeholder="공유 PIN" />
        </label>
        <button type="button" onClick={run} disabled={busy || picks.length !== 2 || !name.trim() || !pin}
          className="rounded bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
          {busy ? '교환 중…' : '↔ 교환 실행'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm underline">취소</button>
      </div>
      <p className="text-xs opacity-60">교환도 공개 로그에 기록되며, 다음 셔플의 &lsquo;직전 자리&rsquo; 기준이 됩니다.</p>
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
    </section>
  )
}
```

`ClassroomView.tsx`에 모드 상태 추가 (변경 부분):

```tsx
// 상태 추가
const [swapMode, setSwapMode] = useState(false)
const [swapPicks, setSwapPicks] = useState<string[]>([])

// 좌석 클릭 분기
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

// JSX: ShuffleControls 아래에 모드 토글 버튼과 SwapControls
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
// SeatMap에 swapPicks={swapPicks} 전달, onSeatClick={handleSeatClick}로 교체
```

Run: `npx vitest run src/components` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components
git commit -m "feat: 자리 교환 모드 (A↔B 스왑, PIN + 로그 기록)"
```

---

### Task 16: 로그 페이지

**Files:**
- Create: `src/app/logs/page.tsx`, `src/components/SessionCard.tsx`, `src/components/SessionCard.test.tsx`

**Interfaces:**
- Consumes: `db.ts`(`fetchSessionsWithAssignments`, `SessionDetail`), `POST /api/invalidate` 계약, `roster.ts`
- Produces: `/logs` 페이지 (공개), `SessionCard` props `{ session: SessionDetail; students: Student[] }`

**표시 명세 (PRD 5.6):**
- 세션 목록 최신순. 각 카드: 일시(KST)·타입·실행자·토글 상태·무효 배지.
- 상세(펼침): **난수 시드**, 재추첨 횟수, 배정 결과 표(학생 → 자리 → **당시 사전 확률** — `prob_snapshot[student][seat]`), 원본 스냅샷 JSON `<details>`.
- 무효 처리 버튼: PIN 입력 → `/api/invalidate` → 새로고침. 무효 세션은 흐리게 + "무효" 배지 (기록은 그대로 보임).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/SessionCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SessionCard } from '@/components/SessionCard'
import type { SessionDetail } from '@/lib/db'
import type { Student } from '@/lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const students: Student[] = [
  { id: '2501', name: '학생01' },
  { id: '2502', name: '학생02' },
]
const session: SessionDetail = {
  id: 'sess-1',
  created_at: '2026-07-05T11:00:00Z',
  type: 'shuffle',
  invalidated: false,
  executed_by: '김철수',
  avoid_prev: true,
  seed: 'abc123',
  redraw_count: 1,
  prob_snapshot: { '2501': { '1-1-L': 0.041 } },
  assignments: [
    { session_id: 'sess-1', student_id: '2501', seat_id: '1-1-L' },
    { session_id: 'sess-1', student_id: '2502', seat_id: '1-1-R' },
  ],
}

describe('SessionCard', () => {
  it('실행자·시드·재추첨 횟수·사전 확률을 표시', async () => {
    render(<SessionCard session={session} students={students} />)
    expect(screen.getByText(/김철수/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /상세/ }))
    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.getByText(/재추첨 1회/)).toBeInTheDocument()
    expect(screen.getByText('4.1%')).toBeInTheDocument()
  })
  it('무효 세션은 무효 배지 표시', () => {
    render(<SessionCard session={{ ...session, invalidated: true }} students={students} />)
    expect(screen.getByText('무효')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run src/components/SessionCard.test.tsx` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/components/SessionCard.tsx`:

```tsx
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
        {session.invalidated && <span className="rounded bg-red-200 px-2 text-xs text-red-900">무효</span>}
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
```

`src/app/logs/page.tsx`:

```tsx
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
```

Run: `npx vitest run src/components/SessionCard.test.tsx` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/logs src/components/SessionCard.tsx src/components/SessionCard.test.tsx
git commit -m "feat: 공개 로그 페이지 (시드/사전확률/무효처리)"
```

---

### Task 17: 결과 이미지 내보내기

**Files:**
- Create: `src/components/ExportImageButton.tsx`, `src/components/ExportImageButton.test.tsx`
- Modify: `src/components/ClassroomView.tsx`

**Interfaces:**
- Consumes: `html-to-image`의 `toPng`
- Produces: `ExportImageButton` props `{ targetRef: RefObject<HTMLElement | null> }`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/ExportImageButton.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:image/png;base64,x') }))

import { toPng } from 'html-to-image'
import { createRef } from 'react'
import { ExportImageButton } from '@/components/ExportImageButton'

describe('ExportImageButton', () => {
  it('클릭 시 대상 요소를 PNG로 변환', async () => {
    const ref = createRef<HTMLDivElement>()
    render(
      <div>
        <div ref={ref}>map</div>
        <ExportImageButton targetRef={ref} />
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: /이미지 저장/ }))
    await waitFor(() => expect(toPng).toHaveBeenCalledWith(ref.current, expect.anything()))
  })
})
```

Run: `npx vitest run src/components/ExportImageButton.test.tsx` → Expected: FAIL

- [ ] **Step 2: 구현**

`src/components/ExportImageButton.tsx`:

```tsx
'use client'

import { toPng } from 'html-to-image'
import type { RefObject } from 'react'
import { useState } from 'react'

export function ExportImageButton({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const [busy, setBusy] = useState(false)

  async function download() {
    if (!targetRef.current) return
    setBusy(true)
    try {
      const dataUrl = await toPng(targetRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 })
      const a = document.createElement('a')
      const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
      a.href = dataUrl
      a.download = `자리배치_${stamp}.png`
      a.click()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button type="button" onClick={download} disabled={busy} className="text-sm underline disabled:opacity-40">
      {busy ? '저장 중…' : '📷 배치도 이미지 저장'}
    </button>
  )
}
```

`ClassroomView.tsx`: `const mapRef = useRef<HTMLDivElement>(null)` 추가, `<div ref={mapRef}><SeatMap …/></div>`로 감싸고 그 위에 `<ExportImageButton targetRef={mapRef} />` 배치.

Run: `npx vitest run src/components/ExportImageButton.test.tsx` → Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components
git commit -m "feat: 배치도 PNG 내보내기"
```

---

### Task 18: 알고리즘 공개 문서 + README

**Files:**
- Create: `docs/algorithm.md`, `README.md` (스캐폴드 README 교체)

**Interfaces:**
- Consumes: Task 3~8의 실제 구현 (문서와 코드가 어긋나면 문서를 코드에 맞출 것)
- Produces: 외부인이 검증 절차를 따라할 수 있는 공개 문서

- [ ] **Step 1: docs/algorithm.md 작성**

다음 내용을 담는다 (완성 문장으로, 코드와 정확히 일치하게):

```markdown
# 자리 배정 알고리즘 — 완전 공개 명세

이 문서는 ebchange.hyunshu.com의 자리 배정이 어떻게 동작하는지,
그리고 누구든 결과를 어떻게 검증할 수 있는지 설명한다.

## 1. 가중치

학생 s가 좌석 t에 배정될 가중치:

    weight(s, t) = d^n(s, t)

- d = 감소 계수 (기본 0.5, 환경 변수 DECAY_FACTOR)
- n(s, t) = s가 t에 앉았던 "배치 기간" 수. 배치 기간 = 셔플부터 다음 셔플까지이며,
  기간 중 자리 교환이 있으면 교환 후 최종 자리 기준. 무효 세션은 제외.
- "직전 자리 피하기"가 ON이면 현재 앉아 있는 자리의 가중치만 0 (하드 제외).
- 고정석 학생은 추첨 없이 항상 고정석 (직전 자리 규칙보다 우선). 고정석은
  다른 학생의 추첨 대상에서도 빠진다.

## 2. 추첨 절차

1. 128비트 난수 시드를 생성한다 (셔플마다 새로, 로그에 공개).
2. 시드 PRNG(seedrandom)로 학생 순서를 Fisher-Yates 셔플한다.
3. 순서대로 각 학생이 남은 좌석 중 가중치 비례로 자리를 뽑는다.
4. 어떤 학생의 남은 좌석 가중치가 전부 0이면 그 시도를 버리고
   파생 시드 `시드#1`, `시드#2`…로 처음부터 다시 뽑는다 (재추첨 횟수도 로그에 기록).

이 절차 전체가 시드에 대해 결정론적이다: 같은 이력 + 같은 옵션 + 같은 시드
→ 항상 같은 결과.

## 3. 표시되는 확률의 의미

화면의 확률은 공식으로 계산한 근사치가 아니라, 위 추첨 절차를 그대로
10,000회(MC_ITERATIONS) 시뮬레이션해 얻은 통계다. 즉 "표시 확률 = 실제 확률"
(표본 오차 ±1%p 미만). 27명을 27자리에 1:1로 배정하는 문제에서는 각 학생의
확률이 서로 독립일 수 없어서, 정확한 확률은 절차 자체의 통계로만 얻을 수 있다.

## 4. 검증 방법 (아무나 가능)

1. 로그 페이지에서 세션의 시드, 옵션, 그 이전까지의 전체 이력을 확인한다.
2. 이 저장소를 클론한다.
3. `drawAssignment({ students, seats, history, avoidPrev, decayFactor, seed })`를
   같은 입력으로 실행한다 (tests/statistical.test.ts의 "재현성" 테스트가 예시).
4. 결과가 로그의 배정과 일치하는지 비교한다. 일치하지 않으면 조작이다.

## 5. 조작이 불가능한 이유

- 시드는 배정과 동시에 저장·공개되고, 결과는 시드의 결정론적 함수다.
- 로그는 append-only: 수정·삭제 API가 존재하지 않는다. 잘못 돌린 세션도
  "무효" 표시만 될 뿐 기록은 남는다.
- 확률 스냅샷이 셔플 직전에 함께 저장되어, 사후에 "확률이 달랐다"고
  주장할 수 없다.
- 코드 전체가 공개되어 있고, 통계 검증 스위트(카이제곱 균등성 검정 포함)가
  저장소에 포함되어 있다: `npm test`로 직접 실행 가능.

## 6. 알려진 한계 (정직성)

- 표시 확률은 몬테카를로 추정치라 ±1%p 미만의 표본 오차가 있다.
- 가중치는 "자리를 뽑는 시점"에 적용되므로, 학생 순서(균등 셔플)에 따른
  상호작용으로 개별 가중치 비율과 최종 확률 비율이 완전히 같지는 않다.
  그래서 확률을 공식이 아닌 시뮬레이션으로 표시한다.
- 배정은 서버에서 실행되므로, 서버 운영자(사이트 소유자)가 코드를 몰래
  바꾸는 것까지 막을 수는 없다. 대신 시드·이력이 공개되므로 사후 검증으로
  반드시 들통난다.
```

- [ ] **Step 2: README.md 작성**

내용: 프로젝트 한 줄 소개, 기능 요약, 로컬 실행법(`npm install` → `.env.local` 작성 → `npm run dev`), 환경 변수 표(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SHUFFLE_PIN, DECAY_FACTOR, MC_ITERATIONS, MAX_REDRAWS), Supabase 마이그레이션 적용법, 학생 명단 수정법(`src/data/students.json`, 고정석 지정 예시), Vercel 배포 절차(저장소 연결 → 환경 변수 4개 설정 → 커스텀 도메인 `ebchange.hyunshu.com` 추가), **주의: PIN·service key는 절대 커밋 금지**, `docs/algorithm.md` 링크.

- [ ] **Step 3: 문서-코드 일치 확인 + 커밋**

`docs/algorithm.md`의 파생 시드 표기(`시드#k`, `:mc:i`, `:snapshot`)가 `draw.ts`/`montecarlo.ts`/`shuffle/route.ts` 구현과 일치하는지 대조.

```bash
git add docs/algorithm.md README.md
git commit -m "docs: 알고리즘 공개 명세 + README"
```

---

### Task 19: 최종 검증 + 전문가 리뷰 게이트

**Files:**
- Modify: 리뷰에서 발견된 파일들

- [ ] **Step 1: 전체 검증**

```bash
npm test          # 전체 테스트 PASS
npm run lint      # 경고 0
npm run build     # 빌드 성공
grep -rn "Math.random" src/   # 결과 없어야 함 (rng.ts 경유 강제)
grep -rn "0119" src/ docs/ README.md   # 결과 없어야 함 (PIN 하드코딩 금지)
```

- [ ] **Step 2: 로컬 E2E 수동 검증 (superpowers:verification-before-completion)**

`npm run dev` 상태에서:
1. 셔플 실행 (올바른 PIN) → 27명 배정 + 애니메이션 확인
2. 틀린 PIN 6회 → 6회째부터 429 확인
3. 학생 클릭 → 확률 오버레이, 토글 변경 → 확률 변화 확인
4. 자리 교환 실행 → 로그에 swap 기록 확인
5. /logs에서 시드·사전 확률 표시, 무효 처리 → 메인 배치가 이전으로 복귀 확인
6. 두 번째 셔플에서 직전 자리 회피(토글 ON) 확인

- [ ] **Step 3: 전문가 리뷰 디스패치 (REQUIRED SUB-SKILL: superpowers:requesting-code-review)**

리뷰어에게 전달할 중점 검토 항목:

> **배정 알고리즘을 무작위 추첨 시스템 전문가의 눈으로 적대적으로 검증하라.**
> 1. 수학적 정확성: Fisher-Yates 편향, weightedPick의 경계/부동소수점 처리, 가중치 규칙(감소·하드제외·고정석 우선순위)이 PRD 및 docs/algorithm.md와 일치하는가
> 2. 재현성: 로그 기록(시드+redraw_count+이력)만으로 결과가 완전 재현되는가, 파생 시드 규칙에 구멍이 없는가
> 3. 통계 검증의 타당성: 카이제곱 임계값·표본 크기·허용 오차가 통계적으로 올바른가, 테스트가 실제로 주장을 검증하는가 (플레이키 가능성 포함)
> 4. 이력 파생: 스왑·무효 처리가 counts/직전 자리에 정확히 반영되는가, 순서 꼬임(동시 실행) 시나리오
> 5. 보안: PIN 타이밍 공격, 레이트리밋 우회(IP 스푸핑 한계 명시 여부), service key 노출 경로
> 6. docs/algorithm.md의 주장과 코드가 완전히 일치하는가 ("완벽" 판정은 문서-코드-테스트 삼자 일치일 때만)

- [ ] **Step 4: 리뷰 지적사항 수정 (superpowers:receiving-code-review 적용 — 맹목 수용 금지, 기술적 검증 후 반영)**

- [ ] **Step 5: 수정 후 재검증 + 커밋**

```bash
npm test && npm run lint && npm run build
git add -A
git commit -m "fix: 전문가 리뷰 지적사항 반영"
```

- [ ] **Step 6: 배포 준비 완료 보고**

사용자에게 보고할 것: 남은 수동 단계 = ① `src/data/students.json` 실명 입력 ② GitHub 저장소 push ③ Vercel 프로젝트 생성 + 환경 변수 설정(SHUFFLE_PIN=0119 포함) ④ 도메인 `ebchange.hyunshu.com` 연결.

---

## Self-Review 결과 (계획 작성 후 점검 완료)

- **스펙 커버리지**: PRD 5.1~5.9(명단/셔플/확률모델/확률UI/스왑/로그/고정석/이미지/애니메이션) → Task 2/11·13/3~8/14/15/16/2·6/17/13, PRD 7(스택/스키마) → Task 1/9, PRD 8(보안) → Task 10/19, PRD 12(확정사항: 0.5·3-4-L·PIN·도메인) → Task 1/2/9/19 반영 확인.
- **자리표시자 없음**: 모든 코드 스텝에 실제 코드 포함. README/algorithm.md는 목차가 아닌 완성 지시 포함.
- **타입 일관성**: `SessionRow`(history.ts)를 db.ts가 재사용, `SessionDetail`이 확장. `DrawResult.seed`는 루트 시드 하나(파생 시드는 저장 안 함 — redraw_count로 재현). `fetchHistoryRows` select에 `executed_by` 추가 필요를 Task 12에 명시.
