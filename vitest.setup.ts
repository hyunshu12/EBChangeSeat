import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// globals:true가 설정돼 있지 않아 RTL 자동 cleanup이 등록되지 않으므로 수동 등록
afterEach(cleanup)
