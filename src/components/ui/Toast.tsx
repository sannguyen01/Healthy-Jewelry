'use client'

import { useEffect } from 'react'
import type { HJProduct } from '@/lib/shopify/types'
import { JewelrySVG } from '@/components/svg/JewelrySVG'

interface ToastProps {
  product: HJProduct | null
  onDismiss: () => void
}

export function Toast({ product, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!product) return
    const timer = setTimeout(onDismiss, 3000)
    return () => clearTimeout(timer)
  }, [product, onDismiss])

  if (!product) return null

  return (
    <>
      <style>{`
        @keyframes hj3SlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .hj-toast {
          animation: hj3SlideIn 0.42s cubic-bezier(0.00,0.00,0.30,1.00) both;
        }
      `}</style>
      <div
        className="hj-toast"
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          backgroundColor: 'var(--black)',
          color: 'var(--bg)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '14px 16px',
          minWidth: '260px',
          maxWidth: '340px',
        }}
      >
        {/* SVG icon */}
        <div style={{ width: 40, height: 40, flexShrink: 0 }}>
          <JewelrySVG type={product.svgType} dark className="w-full h-full" />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontFamily: 'var(--font-ui)',
              fontSize: '9px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(247,245,241,0.55)',
              marginBottom: '3px',
            }}
          >
            Added to bag
          </p>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {product.title}
          </p>
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            color: 'rgba(247,245,241,0.5)',
            fontSize: '1rem',
            cursor: 'pointer',
            padding: '4px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </>
  )
}

export default Toast
