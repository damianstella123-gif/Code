import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onComplete: () => void
}

function Particle({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: 4,
        height: 4,
        background: '#d0003a',
        boxShadow: '0 0 6px rgba(208,0,58,0.6)',
        left: '50%',
        top: '50%',
      }}
      initial={{ x, y, opacity: 0, scale: 0 }}
      animate={{
        x: [x, x * 0.3, 0],
        y: [y, y * 0.3, 0],
        opacity: [0, 1, 0.8, 0],
        scale: [0, 1.2, 0.8, 0],
      }}
      transition={{
        duration: 0.9,
        delay,
        ease: 'easeInOut',
      }}
    />
  )
}

export default function BrandEvolutionTransition({ onComplete }: Props) {
  const [phase, setPhase] = useState<'origin' | 'particles' | 'synergy' | 'done'>('origin')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('particles'), 800)
    const t2 = setTimeout(() => setPhase('synergy'), 1300)
    const t3 = setTimeout(() => setPhase('done'), 2100)
    const t4 = setTimeout(() => onComplete(), 2400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [onComplete])

  const particles = useMemo(() => {
    const items: { x: number; y: number; delay: number }[] = []
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2
      const radius = 60 + Math.random() * 40
      items.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        delay: i * 0.02,
      })
    }
    return items
  }, [])

  return (
    <AnimatePresence>
      {phase !== 'done' && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          style={{
            background: 'linear-gradient(145deg, #06080b 0%, #0e1218 50%, #121821 100%)',
          }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Origin logo phase */}
          <AnimatePresence mode="wait">
            {phase === 'origin' && (
              <motion.div
                key="origin"
                className="flex flex-col items-center gap-6"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02, filter: 'blur(4px)' }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <img
                  src="/simmetria-grigio_2023.jpg"
                  alt="Simmetria Immagine e Comunicazione"
                  className="w-72 sm:w-96 object-contain"
                  style={{ filter: 'brightness(1.3)' }}
                />
                <motion.p
                  className="text-sm sm:text-base tracking-wide"
                  style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-sans)' }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                >
                  Since 1990, creating experiences.
                </motion.p>
              </motion.div>
            )}

            {/* Particle convergence phase */}
            {phase === 'particles' && (
              <motion.div
                key="particles"
                className="relative w-40 h-40 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {particles.map((p, i) => (
                  <Particle key={i} x={p.x} y={p.y} delay={p.delay} />
                ))}
                <motion.div
                  className="absolute rounded-full"
                  style={{
                    width: 12,
                    height: 12,
                    background: 'radial-gradient(circle, #d0003a, transparent)',
                  }}
                  animate={{
                    scale: [0, 2, 1],
                    opacity: [0, 0.8, 0.4],
                  }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                />
              </motion.div>
            )}

            {/* Synergy logo reveal */}
            {phase === 'synergy' && (
              <motion.div
                key="synergy"
                className="flex flex-col items-center gap-6"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <motion.div
                  className="relative"
                  animate={{
                    filter: ['brightness(1)', 'brightness(1.15)', 'brightness(1)'],
                  }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                >
                  <img
                    src="/Logo_1.png"
                    alt="Simmetria Synergy"
                    className="w-56 sm:w-72 object-contain"
                  />
                  {/* Glow behind logo */}
                  <motion.div
                    className="absolute inset-0 -z-10"
                    style={{
                      background: 'radial-gradient(ellipse at center, rgba(208,0,58,0.15) 0%, transparent 70%)',
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1.3 }}
                    transition={{ duration: 0.6, delay: 0.1 }}
                  />
                </motion.div>
                <motion.div
                  className="text-center space-y-1"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.35 }}
                >
                  <p
                    className="text-xs sm:text-sm tracking-wide italic"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    Humans are designed to be symmetrical.
                  </p>
                  <p
                    className="text-xs sm:text-sm tracking-wide italic"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                  >
                    The future is designed to be Synergy.
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
