const CACHE = 'synergy-v1'
const STATIC = 'synergy-static-v1'

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC).then(c =>
      c.addAll(['/', '/index.html', '/logo-synergy.png'])
    )
  )
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

  if (url.hostname.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request.clone())
        .then(res => {
          if (e.request.method === 'GET') {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()))
          }
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

  e.respondWith(
    caches.match(e.request)
      .then(cached => cached ||
        fetch(e.request).then(res => {
          caches.open(STATIC).then(c => c.put(e.request, res.clone()))
          return res
        })
      ).catch(() => caches.match('/index.html'))
  )
})
