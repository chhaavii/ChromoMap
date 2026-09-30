import type { ReactNode } from 'react'

export function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md ${className}`}>
      {children}
    </div>
  )
}

export function PillButton({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  ariaLabel,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  ariaLabel?: string
}) {
  const styles =
    variant === 'primary'
      ? 'bg-white text-black hover:bg-white/85'
      : variant === 'danger'
        ? 'border border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25'
        : 'border border-white/25 bg-white/5 text-white hover:bg-white/15'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${styles}`}
    >
      {children}
    </button>
  )
}
