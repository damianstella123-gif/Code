import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getResolvedTheme } from '@/lib/theme'

interface Props {
  onComplete: () => void
}

function ElectricArcs({ count, radius }: { count: number; radius: number }) {
  const arcs = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5
      const len = 8 + Math.random() * 14
      const x1 = Math.cos(angle) * radius
      const y1 = Math.sin(angle) * radius
      const x2 = Math.cos(angle) * (radius + len)
      const y2 = Math.sin(angle) * (radius + len)
      const cx = (x1 + x2) / 2 + (Math.random() - 0.5) * 10
      const cy = (y1 + y2) / 2 + (Math.random() - 0.5) * 10
      return { x1, y1, x2, y2, cx, cy, delay: Math.random() * 0.3 }
    })
  }, [count, radius])

  return (
    <svg className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
      <g transform="translate(50%, 50%)" style={{ transform: 'translate(50%, 50%)' }}>
        {arcs.map((arc, i) => (
          <motion.path
            key={i}
            d={`M ${arc.x1} ${arc.y1} Q ${arc.cx} ${arc.cy} ${arc.x2} ${arc.y2}`}
            stroke="#00e5ff"
            strokeWidth={0.8 + Math.random() * 0.6}
            fill="none"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1, 1, 0],
              opacity: [0, 0.9, 0.7, 0],
            }}
            transition={{
              duration: 0.35,
              delay: arc.delay,
              ease: 'easeOut',
            }}
          />
        ))}
      </g>
    </svg>
  )
}

export default function BrandEvolutionTransition({ onComplete }: Props) {
  const [phase, setPhase] = useState<
    'origin' | 'spark' | 'arcs' | 'flash-warm' | 'flash-cold' | 'synergy' | 'exit'
  >('origin')
  const isDark = getResolvedTheme() === 'dark'
  const stableComplete = useCallback(onComplete, [onComplete])

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('spark'), 800),
      setTimeout(() => setPhase('arcs'), 1150),
      setTimeout(() => setPhase('flash-warm'), 1450),
      setTimeout(() => setPhase('flash-cold'), 1600),
      setTimeout(() => setPhase('synergy'), 1850),
      setTimeout(() => setPhase('exit'), 3200),
      setTimeout(() => stableComplete(), 3350),
    ]
    return () => timers.forEach(clearTimeout)
  }, [stableComplete])

  const bg = isDark ? '#06080b' : '#f7f7f5'
  const sub = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(37,40,43,0.45)'
  const logoFilter = isDark ? 'brightness(0.85) invert(1) hue-rotate(180deg)' : 'none'

  const isFlashWarm = phase === 'flash-warm'
  const isFlashCold = phase === 'flash-cold'
  const isFlash = isFlashWarm || isFlashCold

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ background: bg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: phase === 'exit' ? 0.15 : 0.2 }}
    >
      {/* Warm flash overlay */}
      <AnimatePresence>
        {isFlashWarm && (
          <motion.div
            key="flash-warm"
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at center, rgba(255,200,100,0.95) 0%, rgba(255,120,20,0.6) 30%, transparent 70%)',
            }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 2.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Cold electric flash overlay */}
      <AnimatePresence>
        {isFlashCold && (
          <motion.div
            key="flash-cold"
            className="absolute inset-0"
            style={{
              background: 'radial-gradient(circle at center, rgba(0,229,255,0.9) 0%, rgba(0,120,255,0.5) 35%, transparent 75%)',
            }}
            initial={{ opacity: 0.5, scale: 1.5 }}
            animate={{ opacity: 1, scale: 3.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Warm shockwave ring */}
      <AnimatePresence>
        {(isFlashWarm || isFlashCold) && (
          <motion.div
            key="ring-warm"
            className="absolute rounded-full"
            style={{
              width: 60,
              height: 60,
              border: '2px solid rgba(255,180,60,0.8)',
              boxShadow: '0 0 20px rgba(255,140,20,0.5)',
            }}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 8, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Cold shockwave ring (chases the warm one) */}
      <AnimatePresence>
        {isFlashCold && (
          <motion.div
            key="ring-cold"
            className="absolute rounded-full"
            style={{
              width: 60,
              height: 60,
              border: '2px solid rgba(0,229,255,0.8)',
              boxShadow: '0 0 25px rgba(0,180,255,0.6)',
            }}
            initial={{ scale: 0.5, opacity: 1 }}
            animate={{ scale: 12, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Main content */}
      <AnimatePresence mode="wait">
        {phase === 'origin' && (
          <motion.div
            key="origin"
            className="flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(4px)', scale: 0.97 }}
            transition={{ duration: 0.5, ease: [0.6, 0.2, 0.4, 1] }}
          >
            <img
              src="/Logo_Simmetria.png"
              alt="Simmetria"
              className="h-14 sm:h-16 object-contain"
              style={{ filter: logoFilter }}
            />
            <p className="mt-4 text-[13px] tracking-wide font-light" style={{ color: sub }}>
              Since 1990, creating experiences.
            </p>
          </motion.div>
        )}

        {phase === 'spark' && (
          <motion.div
            key="spark"
            className="relative flex items-center justify-center"
            style={{ width: 80, height: 80 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.08 }}
          >
            {/* Flickering hot core */}
            <motion.div
              className="absolute rounded-full"
              style={{ width: 12, height: 12 }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1.3, 0.9, 1.4, 1.0, 1.5, 1.1],
                opacity: [0, 1, 0.7, 1, 0.6, 1, 0.8],
                background: [
                  'radial-gradient(circle, #fff 20%, #ffe066 60%, #ff6600 100%)',
                  'radial-gradient(circle, #fffbe6 20%, #ffaa00 60%, #cc3300 100%)',
                  'radial-gradient(circle, #fff 20%, #ffd700 60%, #ff4500 100%)',
                  'radial-gradient(circle, #fffbe6 20%, #ff8800 60%, #cc2200 100%)',
                  'radial-gradient(circle, #fff 20%, #ffe066 60%, #ff6600 100%)',
                  'radial-gradient(circle, #fffbe6 10%, #ffcc00 50%, #ff3300 100%)',
                  'radial-gradient(circle, #fff 20%, #ffd700 60%, #ff4500 100%)',
                ],
                boxShadow: [
                  '0 0 8px #ff6600, 0 0 20px rgba(255,100,0,0.5)',
                  '0 0 12px #ffaa00, 0 0 30px rgba(255,150,0,0.6)',
                  '0 0 6px #ff4500, 0 0 18px rgba(255,70,0,0.4)',
                  '0 0 14px #ff8800, 0 0 35px rgba(255,130,0,0.7)',
                  '0 0 8px #ff6600, 0 0 22px rgba(255,100,0,0.5)',
                  '0 0 16px #ffcc00, 0 0 40px rgba(255,200,0,0.6)',
                  '0 0 10px #ffd700, 0 0 25px rgba(255,200,0,0.5)',
                ],
              }}
              transition={{
                duration: 0.3,
                ease: 'linear',
                times: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 1],
              }}
            />
            {/* Outer ember glow */}
            <motion.div
              className="absolute rounded-full"
              style={{ width: 28, height: 28 }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1, 0.8, 1.2, 1],
                opacity: [0, 0.4, 0.2, 0.5, 0.3],
              }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div
                className="w-full h-full rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,150,0,0.3) 0%, transparent 70%)',
                }}
              />
            </motion.div>
          </motion.div>
        )}

        {phase === 'arcs' && (
          <motion.div
            key="arcs"
            className="relative flex items-center justify-center"
            style={{ width: 120, height: 120 }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.05 }}
          >
            {/* Core still burning */}
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 14,
                height: 14,
                background: 'radial-gradient(circle, #fff 20%, #ffcc00 50%, #ff4500 100%)',
                boxShadow: '0 0 14px #ff6600, 0 0 30px rgba(255,100,0,0.6)',
              }}
              animate={{
                scale: [1, 1.4, 1.1, 1.5, 1.2],
                opacity: [1, 0.8, 1, 0.7, 1],
              }}
              transition={{ duration: 0.3, ease: 'linear' }}
            />
            {/* Electric arcs crackling */}
            <ElectricArcs count={7} radius={14} />
          </motion.div>
        )}

        {isFlash && (
          <motion.div
            key="flash-center"
            className="relative flex items-center justify-center"
            style={{ width: 40, height: 40 }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 20,
                height: 20,
                background: isFlashWarm
                  ? 'radial-gradient(circle, #fff 30%, #ffcc44 70%, transparent 100%)'
                  : 'radial-gradient(circle, #fff 30%, #00e5ff 70%, transparent 100%)',
              }}
              initial={{ scale: 1 }}
              animate={{ scale: 0 }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>
        )}

        {phase === 'synergy' && (
          <motion.div
            key="synergy"
            className="flex flex-col items-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.2, 1, 0.4, 1] }}
          >
            <motion.div
              initial={{
                filter: 'drop-shadow(0 0 18px rgba(0,229,255,0.9)) drop-shadow(0 0 40px rgba(0,180,255,0.5))',
              }}
              animate={{
                filter: 'drop-shadow(0 0 0px rgba(0,229,255,0)) drop-shadow(0 0 0px rgba(0,180,255,0))',
              }}
              transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1 }}
            >
              <motion.img
                src="/logo-synergy.png"
                alt="Simmetria Synergy"
                className="h-16 sm:h-20 object-contain"
                style={{ filter: logoFilter }}
                initial={{ filter: `${logoFilter} blur(2px)` }}
                animate={{ filter: `${logoFilter} blur(0px)` }}
                transition={{ duration: 1.0, ease: 'easeOut', delay: 0.2 }}
              />
            </motion.div>
            <motion.div
              className="mt-5 text-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
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
