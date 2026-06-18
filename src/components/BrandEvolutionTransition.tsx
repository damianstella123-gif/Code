import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getResolvedTheme } from '@/lib/theme'

interface Props {
  onComplete: () => void
}

export default function BrandEvolutionTransition({ onComplete }: Props) {
  const [phase, setPhase] = useState<'origin' | 'line' | 'synergy' | 'exit'>('origin')
  const isDark = getResolvedTheme() === 'dark'
  const stableComplete = useCallback(onComplete, [onComplete])

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('line'), 700),
      setTimeout(() => setPhase('synergy'), 1050),
      setTimeout(() => setPhase('exit'), 1700),
      setTimeout(() => stableComplete(), 1800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [stableComplete])

  const bg = isDark
    ? '#06080b'
    : '#f7f7f5'

  const sub = isDark
    ? 'rgba(255,255,255,0.45)'
    : 'rgba(37,40,43,0.45)'

  const logoFilter = isDark
    ? 'brightness(0.85) invert(1) hue-rotate(180deg)'
    : 'none'

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: bg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: phase === 'exit' ? 0.1 : 0.15 }}
    >
      <AnimatePresence mode="wait">
        {phase === 'origin' && (
          <motion.div
            key="origin"
            className="flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <img
              src="/simmetria-grigio_2023.png"
              alt="Simmetria Immagine e Comunicazione"
              className="h-14 sm:h-16 object-contain"
              style={{ filter: logoFilter }}
            />
            <p
              className="mt-4 text-[13px] tracking-wide font-light"
              style={{ color: sub }}
            >
              Since 1990, creating experiences.
            </p>
          </motion.div>
        )}

        {phase === 'line' && (
          <motion.div
            key="line"
            className="flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
          >
            <motion.div
              style={{
                height: 1.5,
                background: 'linear-gradient(90deg, transparent, #d0003a, transparent)',
                borderRadius: 1,
              }}
              initial={{ width: 0 }}
              animate={{ width: 64 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            />
          </motion.div>
        )}

        {phase === 'synergy' && (
          <motion.div
            key="synergy"
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src="/Logo_1.png"
              alt="Simmetria Synergy"
              className="h-16 sm:h-20 object-contain"
              style={{ filter: logoFilter }}
            />
            <motion.div
              className="mt-5 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.25 }}
            >
              <p className="text-[12px] sm:text-[13px] tracking-wide font-light leading-5" style={{ color: sub }}>
                Humans are designed to be symmetrical.
              </p>
              <p className="text-[12px] sm:text-[13px] tracking-wide font-light leading-5" style={{ color: sub }}>
                The future is designed to be Synergy.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
