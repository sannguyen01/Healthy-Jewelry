import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMedia, useIsMobile, useIsTablet } from '@/lib/hooks/useMedia'

// ── useMedia ───────────────────────────────────────────────────────────────

type MockMQ = {
  matches: boolean
  addEventListener: ReturnType<typeof vi.fn>
  removeEventListener: ReturnType<typeof vi.fn>
  dispatchEvent: ReturnType<typeof vi.fn>
}

const createMockMQ = (matches: boolean): MockMQ => ({
  matches,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})

describe('useMedia', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    matchMediaMock = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })
  })

  it('returns false initially when media query does not match', () => {
    matchMediaMock.mockReturnValue(createMockMQ(false))
    const { result } = renderHook(() => useMedia('(max-width: 768px)'))
    expect(result.current).toBe(false)
  })

  it('returns true when media query matches on mount', () => {
    matchMediaMock.mockReturnValue(createMockMQ(true))
    const { result } = renderHook(() => useMedia('(max-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('registers a change event listener', () => {
    const mq = createMockMQ(false)
    matchMediaMock.mockReturnValue(mq)
    renderHook(() => useMedia('(max-width: 768px)'))
    expect(mq.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('removes the change listener on unmount', () => {
    const mq = createMockMQ(false)
    matchMediaMock.mockReturnValue(mq)
    const { unmount } = renderHook(() => useMedia('(max-width: 768px)'))
    unmount()
    expect(mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('passes the exact query string to matchMedia', () => {
    matchMediaMock.mockReturnValue(createMockMQ(false))
    renderHook(() => useMedia('(prefers-color-scheme: dark)'))
    expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })
})

describe('useIsMobile', () => {
  it('queries the 768px mobile breakpoint', () => {
    const mq = createMockMQ(true)
    const matchMedia = vi.fn().mockReturnValue(mq)
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia })
    renderHook(() => useIsMobile())
    expect(matchMedia).toHaveBeenCalledWith('(max-width: 768px)')
  })
})

describe('useIsTablet', () => {
  it('queries the 769–1024px tablet breakpoint', () => {
    const mq = createMockMQ(false)
    const matchMedia = vi.fn().mockReturnValue(mq)
    Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia })
    renderHook(() => useIsTablet())
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 769px) and (max-width: 1024px)')
  })
})
