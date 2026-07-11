const CACHE = 'synergy-v2'
const STATIC = 'synergy-static-v2'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE && k !== STATIC)
        .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  if (e.request.method !== 'GET') return

  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request.clone())
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
          return res
        })
        .catch(() => caches.match(e.request)
          .then(cached => cached ||
            new Response(
              JSON.stringify({ offline: true }),
              { headers: { 'Content-Type': 'application/json' } }
            )
          )
        )
    )
    return
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(STATIC).then(c => c.put(e.request, copy))
        }
        return res
      })
      .catch(() => caches.match(e.request))
  )
})
