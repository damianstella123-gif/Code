import { useState, useEffect } from 'react'
import { loadUser } from '@/lib/auth'
import { SPLASH_ASSETS as A } from './splash-assets'

/**
 * SplashScreen — "Il nome che si dimostra"
 * Atto 1: SIMMETRIA — il simbolo nasce per riflessioni (origami 3D)
 * Atto 2: SYNERGY — la parola si assembla, le 3 barre Ξ cadono nel vuoto
 *
 * - Tema: segue data-theme dell'app (scelta utente)
 * - Nome: utente loggato, saluto in base all'ora
 * - Full animation solo al primo login del giorno; poi versione rapida
 * - prefers-reduced-motion → versione rapida
 */

let shownThisSession = false // evita replay a ogni navigazione

const FULL_MS = 3350   // durata atto 1+2+saluto
const EXIT_MS = 600
const QUICK_MS = 900

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
        {/* ATTO 1 — SIMMETRIA: origami di riflessioni */}
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

          {/* ATTO 2 — SYNERGY: le parti diventano uno */}
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
          {saluto}{name ? <>, <em>{name}</em></> : ''}. Prepariamo la tua giornata…
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
.ss-inner{display:flex;flex-direction:column;align-items:center}

/* ═══ ATTO 1 — origami ═══ */
.ss-mark{position:relative;width:clamp(150px,20vw,200px);aspect-ratio:382/380;perspective:900px}
.ss-mark img,.ss-half{position:absolute;backface-visibility:hidden}
.ss-q{width:50%;height:50%;object-fit:contain}
.ss-tl{top:0;left:0;opacity:0;transform:translateY(8px) scale(.97);
  animation:ssSeed .5s .15s cubic-bezier(.19,1,.22,1) forwards}
@keyframes ssSeed{to{opacity:1;transform:translateY(0) scale(1)}}
.ss-tr{top:0;right:0;transform-origin:left center;transform:rotateY(-180deg);opacity:0;
  animation:ssUnfoldY .55s .62s cubic-bezier(.3,.1,.25,1) forwards}
@keyframes ssUnfoldY{0%{transform:rotateY(-180deg);opacity:1}100%{transform:rotateY(0);opacity:1}}
.ss-half{bottom:0;left:0;width:100%;height:50%;transform-origin:center top;
  transform:rotateX(-180deg);opacity:0;
  animation:ssUnfoldX .6s 1.12s cubic-bezier(.3,.1,.25,1) forwards}
@keyframes ssUnfoldX{0%{transform:rotateX(-180deg);opacity:1}100%{transform:rotateX(0);opacity:1}}
.ss-half img{position:absolute;top:0;width:50%;height:100%;object-fit:contain;backface-visibility:hidden}
.ss-bl{left:0}.ss-br{right:0}
.ss-mark::before{content:'';position:absolute;inset:-25%;border-radius:50%;
  background:radial-gradient(circle,var(--red2,#d21f3c) 0%,transparent 62%);
  opacity:0;animation:ssBreathe 1s 1.55s ease-in-out;pointer-events:none}
@keyframes ssBreathe{0%{opacity:0}40%{opacity:.12}100%{opacity:0}}
.ss-mark{animation:ssSettle .45s 1.75s cubic-bezier(.34,1.56,.64,1)}
@keyframes ssSettle{0%{transform:scale(1)}40%{transform:scale(1.02)}100%{transform:scale(1)}}

/* ═══ parole ═══ */
.ss-words{display:flex;flex-direction:column;align-items:center}
[data-theme="dark"] .syn-splash .ss-words{
  background:#f4f5f7;border-radius:14px;padding:16px 26px 20px;margin-top:26px}
.ss-simmetria{display:block;width:clamp(220px,32vw,320px);margin-top:34px;
  opacity:0;transform:translateY(10px);
  animation:ssRise .9s 1.5s cubic-bezier(.19,1,.22,1) forwards}
[data-theme="dark"] .syn-splash .ss-simmetria{margin-top:0}
@keyframes ssRise{to{opacity:1;transform:translateY(0)}}

/* ═══ ATTO 2 — synergy ═══ */
.ss-synergy{position:relative;width:clamp(220px,32vw,320px);aspect-ratio:612/78;margin-top:12px}
.ss-synergy img{position:absolute;top:0;height:100%;object-fit:contain}
.ss-syn-l{left:0;width:45.915%;opacity:0;transform:translateX(-22px);
  animation:ssMeet .7s 1.75s cubic-bezier(.19,1,.22,1) forwards}
.ss-syn-r{left:54.739%;width:45.261%;opacity:0;transform:translateX(22px);
  animation:ssMeet .7s 1.75s cubic-bezier(.19,1,.22,1) forwards}
@keyframes ssMeet{to{opacity:1;transform:translateX(0)}}
.ss-xi{position:absolute;left:45.915%;width:8.824%;height:100%}
.ss-xi img{position:absolute;left:0;width:100%;height:auto;
  opacity:0;transform:translateY(-10px) scaleX(.55)}
.ss-b0{top:7.7%;animation:ssBar .38s 2.30s cubic-bezier(.34,1.4,.5,1) forwards}
.ss-b1{top:42.3%;animation:ssBar .38s 2.44s cubic-bezier(.34,1.4,.5,1) forwards}
.ss-b2{top:78.2%;animation:ssBar .38s 2.58s cubic-bezier(.34,1.4,.5,1) forwards}
@keyframes ssBar{to{opacity:1;transform:translateY(0) scaleX(1)}}

/* ═══ chiusura ═══ */
.ss-line{height:1px;background:var(--line);width:0;margin-top:28px;
  animation:ssLine .9s 2.75s cubic-bezier(.19,1,.22,1) forwards;
  position:relative;overflow:hidden}
@keyframes ssLine{to{width:min(280px,58vw)}}
.ss-line::after{content:'';position:absolute;top:0;left:-40%;width:40%;height:100%;
  background:linear-gradient(90deg,transparent,var(--red2,#d21f3c),transparent);
  animation:ssShimmer 1.8s 3.4s ease-in-out 1}
@keyframes ssShimmer{0%{left:-40%}100%{left:100%}}
.ss-greet{margin-top:18px;font-size:14px;letter-spacing:.05em;color:var(--muted);
  opacity:0;transform:translateY(6px);
  animation:ssRise .9s 2.95s cubic-bezier(.19,1,.22,1) forwards}
.ss-greet em{font-style:normal;color:var(--red2,#d21f3c);font-weight:600}

/* ═══ USCITA: origami si richiude ═══ */
.syn-splash.exit .ss-half{animation:ssFoldX .45s cubic-bezier(.5,0,.75,.4) forwards}
@keyframes ssFoldX{to{transform:rotateX(-180deg)}}
.syn-splash.exit .ss-tr{animation:ssFoldY .45s .14s cubic-bezier(.5,0,.75,.4) forwards}
@keyframes ssFoldY{to{transform:rotateY(-180deg)}}
.syn-splash.exit .ss-tl{animation:ssFadeQ .3s .34s ease forwards}
@keyframes ssFadeQ{to{opacity:0}}
.syn-splash.exit .ss-words,.syn-splash.exit .ss-line,.syn-splash.exit .ss-greet{
  animation:ssSilkOut .5s .05s cubic-bezier(.4,0,.6,1) forwards}
@keyframes ssSilkOut{to{opacity:0;transform:translateY(-4px);filter:blur(3px)}}
.syn-splash.exit{animation:ssBgOut .35s .45s ease forwards}
@keyframes ssBgOut{to{opacity:0}}

/* ═══ QUICK MODE (repeat login / reduced motion) ═══ */
.syn-splash.quick .ss-tl,.syn-splash.quick .ss-tr,.syn-splash.quick .ss-half,
.syn-splash.quick .ss-simmetria,.syn-splash.quick .ss-syn-l,.syn-splash.quick .ss-syn-r,
.syn-splash.quick .ss-xi img,.syn-splash.quick .ss-greet{
  animation:none;opacity:1;transform:none}
.syn-splash.quick .ss-line{animation:none;width:min(280px,58vw)}
.syn-splash.quick .ss-line::after{animation:none}
.syn-splash.quick .ss-mark::before{animation:none}
.syn-splash.quick .ss-inner{opacity:0;animation:ssQuickIn .4s ease forwards}
@keyframes ssQuickIn{to{opacity:1}}
.syn-splash.quick.exit .ss-inner{animation:ssSilkOut .4s ease forwards}
.syn-splash.quick.exit .ss-tl,.syn-splash.quick.exit .ss-tr{animation:none}
.syn-splash.quick.exit .ss-half{animation:none}
`