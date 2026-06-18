import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getResolvedTheme } from '@/lib/theme'

/**
 * Storyboard:
 * 0ms    - Fullscreen overlay fades in (inherits theme bg)
 * 100ms  - Logo "Simmetria Immagine e Comunicazione" appears centered
 *          Tagline "Since 1990, creating experiences." fades below
 * 900ms  - Origin logo fades out with subtle upward drift
 * 1100ms - Subtle red accent line draws across center (brand connector)
 * 1400ms - Logo "Simmetria Synergy" scales in with refined ease
 *          Tagline appears below
 * 2200ms - Overlay fades to transparent, revealing dashboard beneath
 * 2400ms - onComplete fires, component unmounts
 */

interface Props {
  onComplete: () => void
}

export default function BrandEvolutionTransition({ onComplete }: Props) {
  const [phase, setPhase] = useState<'origin' | 'connector' | 'synergy' | 'exit'>('origin')
  const isDark = getResolvedTheme() === 'dark'

  const stableComplete = useCallback(onComplete, [onComplete])

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('connector'), 900),
      setTimeout(() => setPhase('synergy'), 1200),
      setTimeout(() => setPhase('exit'), 2100),
      setTimeout(() => stableComplete(), 2400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [stableComplete])

  const bgColor = isDark
    ? 'linear-gradient(180deg, #06080b 0%, #0c1015 100%)'
    : 'linear-gradient(180deg, #f7f7f5 0%, #f0eeec 100%)'

  const textColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(37,40,43,0.55)'
  const accentGlow = isDark
    ? 'radial-gradient(ellipse at center, rgba(208,0,58,0.12) 0%, transparent 70%)'
    : 'radial-gradient(ellipse at center, rgba(208,0,58,0.06) 0%, transparent 70%)'

  return (
    <AnimatePresence>
      {phase !== 'exit' ? (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{ background: bgColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <AnimatePresence mode="wait">
            {/* Phase 1: Origin Logo */}
            {phase === 'origin' && (
              <motion.div
                key="origin"
                className="flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="rounded-2xl p-5 overflow-hidden" style={{
                  background: isDark ? '#ffffff' : 'transparent',
                  boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.3)' : 'none',
                }}>
                  <img
                    src="/simmetria-grigio_2023.jpg"
                    alt="Simmetria Immagine e Comunicazione"
                    className="w-56 sm:w-72 object-contain"
                  />
                </div>
                <motion.p
                  className="mt-5 text-sm sm:text-base tracking-wide font-light"
                  style={{ color: textColor }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.3 }}
                >
                  Since 1990, creating experiences.
                </motion.p>
              </motion.div>
            )}

            {/* Phase 2: Connector - subtle red line */}
            {phase === 'connector' && (
              <motion.div
                key="connector"
                className="flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <motion.div
                  style={{
                    height: 2,
                    background: 'linear-gradient(90deg, transparent, #d0003a, transparent)',
                    borderRadius: 1,
                  }}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 80, opacity: 1 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                />
              </motion.div>
            )}

            {/* Phase 3: Synergy Logo */}
            {phase === 'synergy' && (
              <motion.div
                key="synergy"
                className="flex flex-col items-center"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="relative">
                  <div className="rounded-2xl p-5 overflow-hidden relative z-10" style={{
                    background: isDark ? '#ffffff' : 'transparent',
                    boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.3)' : 'none',
                  }}>
                    <img
                      src="/Logo_1.png"
                      alt="Simmetria Synergy"
                      className="w-44 sm:w-56 object-contain"
                    />
                  </div>
                  <motion.div
                    className="absolute inset-0 -z-10"
                    style={{ background: accentGlow }}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1.6 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                  />
                </div>
                <motion.div
                  className="mt-6 text-center"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.3 }}
                >
                  <p className="text-xs sm:text-sm tracking-wide" style={{ color: textColor }}>
                    Humans are designed to be symmetrical.
                  </p>
                  <p className="text-xs sm:text-sm tracking-wide mt-0.5" style={{ color: textColor }}>
                    The future is designed to be Synergy.
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ) : (
        <motion.div
          key="fade-out"
          className="fixed inset-0 z-[9999]"
          style={{ background: bgColor }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        />
      )}
    </AnimatePresence>
  )
}
