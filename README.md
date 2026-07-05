# EB Change Seat

교실 자리 배정을 **검증 가능한 방식으로** 공정하게 뽑는 웹앱.
27명을 27자리에 1:1로 배정하며, 각 배정은 공개된 난수 시드로부터 결정론적으로
재현된다. 배포: [ebchange.hyunshu.com](https://ebchange.hyunshu.com) ·
저장소: [github.com/hyunshu12/EBChangeSeat](https://github.com/hyunshu12/EBChangeSeat)

## 기능 요약

- **가중 자리 추첨**: 과거에 앉았던 자리일수록 확률이 낮아진다(감소 계수 `d^n`).
  "직전 자리 피하기" 옵션과 고정석(`fixedSeatId`) 지정을 지원.
- **실제 확률 표시**: 근사 공식이 아니라 추첨 절차를 10,000회 시뮬레이션한 통계.
- **공개 로그**: 시드·옵션·확률 스냅샷·배정이 append-only로 기록되어 누구나 사후
  검증 가능. 세션은 삭제 불가, "무효" 표시만 가능.
- **자리 교환 모드**: 배치 기간 중 두 학생의 자리를 맞바꾼다(이력에 최종 자리 반영).
- **이미지 내보내기**: 현재 배치도를 이미지로 저장.

배정 알고리즘의 완전한 명세와 검증 절차는 **[docs/algorithm.md](docs/algorithm.md)**
에 공개되어 있다.

## 로컬 실행

```bash
npm install
cp .env.example .env.local   # 값 채우기 (아래 표 참고)
npm run dev                  # http://localhost:3000
```

### 통계 검증 스위트 실행

배정이 공정한지(균등성·감소 효과·재현성)는 저장소에 포함된 테스트로 직접 확인할 수 있다.
카이제곱 균등성 검정을 포함한 통계 검증 스위트를 다음 한 줄로 실행한다:

```bash
npm test
```

## 환경 변수

`.env.local`(로컬)과 Vercel 프로젝트 설정에만 넣는다. `.env.example`에는 자리표시자만 있다.

| 변수 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `SUPABASE_URL` | 필수 | — | Supabase 프로젝트 URL (프로젝트 → Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | — | service-role 키. 서버 전용, **절대 공개 금지** |
| `SHUFFLE_PIN` | 필수 | — | 셔플/교환/무효 처리 공유 PIN |
| `DECAY_FACTOR` | 선택 | `0.5` | 감소 계수 `d` (범위 0 초과 1 이하) |
| `MC_ITERATIONS` | 선택 | `10000` | 확률 추정 몬테카를로 반복 횟수 |
| `MAX_REDRAWS` | 선택 | `100` | 막다른 배정 시 재추첨 최대 횟수 |

> **⚠️ 절대 규칙**: 실제 `SHUFFLE_PIN` 값과 `SUPABASE_SERVICE_ROLE_KEY`는
> README·코드·커밋 어디에도 등장해서는 안 된다. `.env.example`의 `SHUFFLE_PIN=0000`은
> 자리표시자일 뿐 실제 PIN이 아니다. 이 값들은 오직 `.env.local`과 Vercel 환경 변수에만 둔다.

## Supabase 마이그레이션

프로젝트 리전은 `ap-northeast-2`(서울). 마이그레이션은 `supabase/migrations/`에 있다:

- `001_init.sql` — 스키마 생성. `sessions`(append-only 로그), `assignments`,
  `pin_attempts` 테이블과 RLS(공개 정책 없음, 서버 service-role 키로만 접근).
- `002_atomic_insert.sql` — 원자적 삽입 RPC `insert_session_with_assignments`.
  세션과 배정 행을 단일 트랜잭션으로 기록해 고아 세션을 방지한다.

적용 방법 (둘 중 하나):

```bash
# Supabase CLI
supabase db push
```

또는 Supabase 대시보드의 **SQL Editor**에서 `001_init.sql` → `002_atomic_insert.sql`
순서대로 붙여넣어 실행한다.

## 학생 명단 수정

명단은 `src/data/students.json`에 있다. 인원 수는 좌석 수와 정확히 같아야 하며
(현재 27), 학번(`id`)은 중복될 수 없다.

```json
[
  { "id": "2501", "name": "학생01" },
  { "id": "2502", "name": "학생02", "fixedSeatId": "2-3-L" }
]
```

- `id` — 학번(문자열, 유일).
- `name` — 표시 이름.
- `fixedSeatId` — (선택) 고정석. 지정하면 추첨에서 제외되고 항상 그 자리에 앉는다
  (직전 자리 회피 규칙보다 우선). 좌석 ID 형식은 `` `${분단}-${행}-${'L'|'R'}` ``
  (예: `2-3-L`), 존재하는 좌석이어야 하고 고정석끼리 겹칠 수 없다.

## Vercel 배포

1. Vercel에서 저장소(`hyunshu12/EBChangeSeat`)를 연결한다(New Project → Import).
2. 프로젝트 환경 변수를 설정한다: 필수 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `SHUFFLE_PIN` (필요 시 선택 변수 `DECAY_FACTOR`, `MC_ITERATIONS`, `MAX_REDRAWS`도 추가).
3. 배포 후 **Settings → Domains**에서 커스텀 도메인 `ebchange.hyunshu.com`을 추가하고
   DNS를 연결한다.

PIN·service key는 여기(Vercel 환경 변수)에만 두고, 저장소에는 절대 커밋하지 않는다.

## 문서

- **[docs/algorithm.md](docs/algorithm.md)** — 자리 배정 알고리즘 완전 공개 명세와
  누구나 따라 할 수 있는 검증 절차.
