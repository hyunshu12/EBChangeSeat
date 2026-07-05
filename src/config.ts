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
