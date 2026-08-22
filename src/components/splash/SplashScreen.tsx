import { useState, useEffect } from 'react'
import { loadUser } from '@/lib/auth'
import { SPLASH_ASSETS as A } from './splash-assets'

let shownThisSession = false

const FULL_MS = 1100
const EXIT_MS = 350
const QUICK_MS = 500

export default function SplashScreen() {
  const [visible, setVisible] = useState(() => !shownThisSession)
  const [exiting, setExiting] = useState(false)
  const [name, setName] = useState('')
  const [quick] = useState(() => {
    const today = new Date().toISOString().slice(0, 10)
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const seenToday = localStorage.getItem('splash_full_date') === today
    if (!seenToday) localStorage.setItem('splash_full_date', today)
    return reduced || seenToday
  })

  const dark = typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'

  useEffect(() => {
    if (!visible) return
    shownThisSession = true
    const user = loadUser()
    setName(user?.first_name || '')
    const total = quick ? QUICK_MS : FULL_MS
    const t1 = setTimeout(() => setExiting(true), total)
    const t2 = setTimeout(() => setVisible(false), total + EXIT_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [visible, quick])

  if (!visible) return null

  const h = new Date().getHours()
  const saluto = h >= 5 && h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'

  return (
    <div className={`syn-splash${exiting ? ' exit' : ''}${quick ? ' quick' : ''}`}>
      <style>{CSS}</style>

      <div className="ss-inner">
        <div className="ss-mark">
          <img className="ss-q ss-tl" alt="" src={A.qTL} />
          <img className="ss-q ss-tr" alt="" src={A.qTR} />
          <div className="ss-half">
            <img className="ss-bl" alt="" src={A.qBL} />
            <img className="ss-br" alt="" src={A.qBR} />
          </div>
        </div>

        <div className="ss-words">
          <img className="ss-simmetria" alt="SIMMETRIA"
            src={dark ? A.simmetriaDark : A.simmetria} />

          <div className="ss-synergy">
            <img className="ss-syn-l" alt="SYN" src={dark ? A.synLeftDark : A.synLeft} />
            <div className="ss-xi">
              <img className="ss-b0" alt="" src={A.bar0} />
              <img className="ss-b1" alt="" src={A.bar1} />
              <img className="ss-b2" alt="" src={A.bar2} />
            </div>
            <img className="ss-syn-r" alt="RGY" src={dark ? A.synRightDark : A.synRight} />
          </div>
        </div>

        <div className="ss-line" />
        <div className="ss-greet">
          {saluto}{name ? <>, <em>{name}</em></> : ''}. Prepariamo la tua giornata\u2026
        </div>
      </div>
    </div>
  )
}

const CSS = `
.syn-splash{
  position:fixed;inset:0;z-index:9999;
  background:var(--bg);
  display:flex;align-items:center;justify-content:center;
  font-family:'Century Gothic','Futura','Avenir Next',system-ui,sans-serif;
}
.ss-inner{display:flex;flex-direction:column;align-items:center;
  opacity:0;transform:translateY(6px) scale(.98);
  animation:ssAppear .5s .05s cubic-bezier(.22,1,.36,1) forwards}

@keyframes ssAppear{to{opacity:1;transform:translateY(0) scale(1)}}

/* ═══ Mark ═══ */
.ss-mark{position:relative;width:clamp(120px,16vw,160px);aspect-ratio:382/380}
.ss-mark img,.ss-half{position:absolute}
.ss-q{width:50%;height:50%;object-fit:contain}
.ss-tl{top:0;left:0}
.ss-tr{top:0;right:0}
.ss-half{bottom:0;left:0;width:100%;height:50%}
.ss-half img{position:absolute;top:0;width:50%;height:100%;object-fit:contain}
.ss-bl{left:0}.ss-br{right:0}

/* ═══ Words ═══ */
.ss-words{display:flex;flex-direction:column;align-items:center;
  opacity:0;animation:ssFadeWords .45s .35s cubic-bezier(.22,1,.36,1) forwards}
[data-theme="dark"] .syn-splash .ss-words{
  background:#f4f5f7;border-radius:14px;padding:16px 26px 20px;margin-top:22px}
@keyframes ssFadeWords{to{opacity:1}}
.ss-simmetria{display:block;width:clamp(200px,28vw,280px);margin-top:28px}
[data-theme="dark"] .syn-splash .ss-simmetria{margin-top:0}

/* ═══ Synergy ═══ */
.ss-synergy{position:relative;width:clamp(200px,28vw,280px);aspect-ratio:612/78;margin-top:10px}
.ss-synergy img{position:absolute;top:0;height:100%;object-fit:contain}
.ss-syn-l{left:0;width:45.915%}
.ss-syn-r{left:54.739%;width:45.261%}
.ss-xi{position:absolute;left:45.915%;width:8.824%;height:100%}
.ss-xi img{position:absolute;left:0;width:100%;height:auto}
.ss-b0{top:7.7%}.ss-b1{top:42.3%}.ss-b2{top:78.2%}

/* ═══ Line accent ═══ */
.ss-line{height:1px;background:var(--line);width:0;margin-top:24px;
  animation:ssLine .6s .5s cubic-bezier(.22,1,.36,1) forwards;
  position:relative;overflow:hidden}
@keyframes ssLine{to{width:min(240px,50vw)}}
.ss-line::after{content:'';position:absolute;top:0;left:-40%;width:40%;height:100%;
  background:linear-gradient(90deg,transparent,var(--red2,#d21f3c),transparent);
  animation:ssShimmer 1s .8s ease-in-out 1}
@keyframes ssShimmer{0%{left:-40%}100%{left:100%}}

/* ═══ Greeting ═══ */
.ss-greet{margin-top:14px;font-size:13px;letter-spacing:.04em;color:var(--muted);
  opacity:0;animation:ssFadeWords .4s .6s cubic-bezier(.22,1,.36,1) forwards}
.ss-greet em{font-style:normal;color:var(--red2,#d21f3c);font-weight:600}

/* ═══ Exit ═══ */
.syn-splash.exit .ss-inner{
  animation:ssExit .35s cubic-bezier(.4,0,1,1) forwards}
@keyframes ssExit{to{opacity:0;transform:translateY(-3px) scale(.99)}}
.syn-splash.exit{animation:ssBgOut .2s .2s ease forwards}
@keyframes ssBgOut{to{opacity:0}}

/* ═══ Quick mode ═══ */
.syn-splash.quick .ss-inner{animation:ssQuickIn .3s ease forwards}
.syn-splash.quick .ss-words{animation:none;opacity:1}
.syn-splash.quick .ss-line{animation:none;width:min(240px,50vw)}
.syn-splash.quick .ss-line::after{animation:none}
.syn-splash.quick .ss-greet{animation:none;opacity:1}
@keyframes ssQuickIn{from{opacity:0}to{opacity:1}}
.syn-splash.quick.exit .ss-inner{animation:ssExit .3s ease forwards}
`
