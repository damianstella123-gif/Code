import type { ReactNode, CSSProperties } from 'react'

interface AnimatedLaserBorderProps {
  active?: boolean
  loading?: boolean
  children: ReactNode
  className?: string
  style?: CSSProperties
}

export default function AnimatedLaserBorder({
  active = true,
  loading = true,
  children,
  className = '',
  style,
}: AnimatedLaserBorderProps) {
  const show = active || loading

  return (
    <div
      className={`laser-border-wrapper ${show ? 'laser-active' : ''} ${loading ? 'laser-loading' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}
