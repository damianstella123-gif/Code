import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getResolvedTheme } from '@/lib/theme'

interface Props {
  onComplete: () => void
}

function NoiseField({ intensity }: { intensity: number }) {
  const particles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      delay: Math.random() * 0.4,
    })), [])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `rgba(${180 + Math.random() * 75}, ${200 + Math.random() * 55}, 255, ${0.4 + Math.random() * 0.4})`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, intensity, intensity * 0.5, intensity, 0],
            scale: [0, 1.5, 0.8, 1.2, 0],
            x: (Math.random() - 0.5) * 20,
            y: (Math.random() - 0.5) * 20,
          }}
          transition={{
            duration: 0.6,
            delay: p.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}

function GlitchSlices({
  src,
  alt,
  className,
  sliceCount,
  scatter,
  chromaticShift,
  logoFilter,
}: {
  src: string
  alt: string
  className: string
  sliceCount: number
  scatter: number
  chromaticShift: number
  logoFilter: string
}) {
  const slices = useMemo(() => {
    const height = 100 / sliceCount
    return Array.from({ length: sliceCount }, (_, i) => ({
      id: i,
      top: i * height,
      height,
      offsetX: (Math.random() - 0.5) * 2,
      delay: Math.random() * 0.08,
    }))
  }, [sliceCount])

  return (
    <div className="relative" style={{ width: 'fit-content' }}>
      {slices.map(slice => (
        <motion.div
          key={slice.id}
          className="overflow-hidden"
          style={{
            position: slice.id === 0 ? 'relative' : 'absolute',
            top: `${slice.top}%`,
            left: 0,
            right: 0,
            height: `${slice.height}%`,
            clipPath: `inset(${slice.top}% 0 ${100 - slice.top - slice.height}% 0)`,
          }}
          animate={{
            x: slice.offsetX * scatter,
            opacity: scatter > 60 ? 0 : 1,
          }}
          transition={{
            duration: 0.3,
            delay: slice.delay,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          <img
            src={src}
            alt={alt}
            className={className}
            style={{
              filter: `${logoFilter} ${chromaticShift > 0 ? `hue-rotate(${chromaticShift * slice.offsetX * 20}deg)` : ''}`,
              position: 'relative',
              top: `-${slice.top}%`,
            }}
          />
        </motion.div>
      ))}
      {/* Chromatic aberration layers */}
      {chromaticShift > 0 && (
        <>
          <motion.img
            src={src}
            alt=""
            className={className}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              filter: `${logoFilter} saturate(2) hue-rotate(-30deg)`,
              mixBlendMode: 'screen',
            }}
            animate={{ x: chromaticShift * 3, opacity: chromaticShift * 0.3 }}
            transition={{ duration: 0.2 }}
          />
          <motion.img
            src={src}
            alt=""
            className={className}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              filter: `${logoFilter} saturate(2) hue-rotate(30deg)`,
              mixBlendMode: 'screen',
            }}
            animate={{ x: -chromaticShift * 3, opacity: chromaticShift * 0.3 }}
            transition={{ duration: 0.2 }}
          />
        </>
      )}
    </div>
  )
}

function ScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 pointer-events-none"
      style={{
        height: 2,
        background: 'linear-gradient(90deg, transparent 5%, rgba(160,220,255,0.7) 30%, rgba(255,255,255,0.9) 50%, rgba(160,220,255,0.7) 70%, transparent 95%)',
        boxShadow: '0 0 12px rgba(160,220,255,0.6), 0 0 30px rgba(100,180,255,0.3)',
      }}
      initial={{ top: '0%', opacity: 0 }}
      animate={{ top: '100%', opacity: [0, 1, 1, 0] }}
      transition={{ duration: 0.5, ease: 'linear' }}
    />
  )
}

function ReconstructBands({
  src,
  alt,
  className,
  logoFilter,
}: {
  src: string
  alt: string
  className: string
  logoFilter: string
}) {
  const bands = useMemo(() => {
    const count = 8
    const height = 100 / count
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      top: i * height,
      height,
      startX: (Math.random() > 0.5 ? 1 : -1) * (80 + Math.random() * 60),
      delay: 0.04 * i + Math.random() * 0.03,
    }))
  }, [])

  return (
    <div className="relative" style={{ width: 'fit-content' }}>
      {bands.map(band => (
        <motion.div
          key={band.id}
          className="overflow-hidden"
          style={{
            position: band.id === 0 ? 'relative' : 'absolute',
            top: `${band.top}%`,
            left: 0,
            right: 0,
            height: `${band.height}%`,
            clipPath: `inset(${band.top}% 0 ${100 - band.top - band.height}% 0)`,
          }}
          initial={{ x: band.startX, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{
            duration: 0.35,
            delay: band.delay,
            ease: [0.2, 0.9, 0.3, 1],
          }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, rgba(100,200,255,0.4), transparent 40%)',
              mixBlendMode: 'screen',
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: band.delay + 0.2 }}
          />
          <img
            src={src}
            alt={alt}
            className={className}
            style={{
              filter: logoFilter,
              position: 'relative',
              top: `-${band.top}%`,
            }}
          />
        </motion.div>
      ))}
    </div>
  )
}

export default function BrandEvolutionTransition({ onComplete }: Props) {
  const [phase, setPhase] = useState<
    'origin' | 'glitch' | 'scatter' | 'void' | 'reconstruct' | 'lock' | 'exit'
  >('origin')
  const isDark = getResolvedTheme() === 'dark'
  const stableComplete = useCallback(onComplete, [onComplete])

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('glitch'), 900),
      setTimeout(() => setPhase('scatter'), 1400),
      setTimeout(() => setPhase('void'), 1800),
      setTimeout(() => setPhase('reconstruct'), 2100),
      setTimeout(() => setPhase('lock'), 2650),
      setTimeout(() => setPhase('exit'), 3400),
      setTimeout(() => stableComplete(), 3550),
    ]
    return () => timers.forEach(clearTimeout)
  }, [stableComplete])

  const bg = isDark ? '#06080b' : '#f7f7f5'
  const sub = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(37,40,43,0.45)'
  const logoFilter = isDark ? 'brightness(0.85) invert(1) hue-rotate(180deg)' : 'none'

  const isGlitching = phase === 'glitch' || phase === 'scatter'

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
      style={{ background: bg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === 'exit' ? 0 : 1 }}
      transition={{ duration: phase === 'exit' ? 0.15 : 0.25 }}
    >
      {/* CRT vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.25) 100%)',
        }}
      />

      {/* Horizontal scan lines background texture */}
      {isGlitching && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 4px)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          transition={{ duration: 0.2 }}
        />
      )}

      <AnimatePresence mode="wait">
        {/* Phase 1: Clean origin */}
        {phase === 'origin' && (
          <motion.div
            key="origin"
            className="flex flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
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

        {/* Phase 2: Glitch interference */}
        {phase === 'glitch' && (
          <motion.div
            key="glitch"
            className="flex flex-col items-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            <motion.div
              animate={{
                x: [0, -2, 3, -1, 2, -3, 1, 0],
                y: [0, 1, -1, 0, 1, -1, 0, 0],
              }}
              transition={{ duration: 0.5, ease: 'linear', repeat: 1 }}
            >
              <GlitchSlices
                src="/Logo_Simmetria.png"
                alt="Simmetria"
                className="h-14 sm:h-16 object-contain"
                sliceCount={6}
                scatter={12}
                chromaticShift={1.2}
                logoFilter={logoFilter}
              />
            </motion.div>
            <motion.p
              className="mt-4 text-[13px] tracking-wide font-light"
              style={{ color: sub }}
              animate={{ opacity: [1, 0.3, 0.8, 0.2, 0.6] }}
              transition={{ duration: 0.4, ease: 'linear' }}
            >
              Since 1990, creating experiences.
            </motion.p>
          </motion.div>
        )}

        {/* Phase 3: Scatter - slices fly apart */}
        {phase === 'scatter' && (
          <motion.div
            key="scatter"
            className="flex flex-col items-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <GlitchSlices
              src="/Logo_Simmetria.png"
              alt="Simmetria"
              className="h-14 sm:h-16 object-contain"
              sliceCount={10}
              scatter={90}
              chromaticShift={2.5}
              logoFilter={logoFilter}
            />
          </motion.div>
        )}

        {/* Phase 4: Void - noise field */}
        {phase === 'void' && (
          <motion.div
            key="void"
            className="relative flex items-center justify-center"
            style={{ width: 200, height: 80 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <NoiseField intensity={0.8} />
            <motion.div
              className="absolute w-16 h-[1px]"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(160,210,255,0.6), transparent)',
              }}
              animate={{
                scaleX: [0, 1.5, 0.8, 1.2],
                opacity: [0, 0.8, 0.5, 0.7],
              }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            />
          </motion.div>
        )}

        {/* Phase 5: Reconstruct - bands slide in carrying new logo */}
        {phase === 'reconstruct' && (
          <motion.div
            key="reconstruct"
            className="flex flex-col items-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            <ReconstructBands
              src="/logo-synergy.png"
              alt="Simmetria Synergy"
              className="h-16 sm:h-20 object-contain"
              logoFilter={logoFilter}
            />
          </motion.div>
        )}

        {/* Phase 6: Lock - clean reveal + scanline confirm */}
        {phase === 'lock' && (
          <motion.div
            key="lock"
            className="relative flex flex-col items-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
          >
            <ScanLine />
            <motion.img
              src="/logo-synergy.png"
              alt="Simmetria Synergy"
              className="h-16 sm:h-20 object-contain"
              style={{ filter: logoFilter }}
              initial={{ filter: `${logoFilter} brightness(1.3)` }}
              animate={{ filter: `${logoFilter} brightness(1)` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
            <motion.div
              className="mt-5 text-center"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
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
