import { cn } from '@/lib/utils/cn'
import { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  aspectRatio?: string
}

export function Skeleton({ className, width, height, aspectRatio }: SkeletonProps) {
  const style: CSSProperties = {
    width: width !== undefined ? (typeof width === 'number' ? `${width}px` : width) : undefined,
    height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
    aspectRatio: aspectRatio,
    background: 'linear-gradient(90deg, var(--nacre) 25%, var(--ash) 50%, var(--nacre) 75%)',
    backgroundSize: '200% 100%',
    animation: 'hj-shimmer 1.6s ease-in-out infinite',
  }

  return (
    <>
      <style>{`
        @keyframes hj-shimmer {
          0%   { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
      `}</style>
      <div
        className={cn('block', className)}
        style={style}
        aria-hidden="true"
      />
    </>
  )
}

export default Skeleton
