import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const SIGNED_URL_TTL = 3600

const PRIVATE_BUCKET_PATTERN = /\/storage\/v1\/object\/(?:public|sign)\/(?:company-logos|supplier-logos|supplier-photos)\/(.+)/

function extractBucketAndPath(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url)
    const match = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/)
    if (match) {
      const bucket = match[1]
      if (['company-logos', 'supplier-logos', 'supplier-photos'].includes(bucket)) {
        return { bucket, path: decodeURIComponent(match[2].split('?')[0]) }
      }
    }
  } catch { /* not a valid URL or not a storage URL */ }
  return null
}

const cache = new Map<string, { url: string; expires: number }>()

export function useSignedUrl(storedUrl: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(() => {
    if (!storedUrl) return null
    const cached = cache.get(storedUrl)
    if (cached && cached.expires > Date.now()) return cached.url
    const parsed = extractBucketAndPath(storedUrl)
    if (!parsed) return storedUrl
    return null
  })

  useEffect(() => {
    if (!storedUrl) { setResolved(null); return }

    const cached = cache.get(storedUrl)
    if (cached && cached.expires > Date.now()) { setResolved(cached.url); return }

    const parsed = extractBucketAndPath(storedUrl)
    if (!parsed) { setResolved(storedUrl); return }

    let cancelled = false
    supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(parsed.path, SIGNED_URL_TTL)
      .then(({ data }) => {
        if (cancelled) return
        if (data?.signedUrl) {
          cache.set(storedUrl, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_TTL - 60) * 1000 })
          setResolved(data.signedUrl)
        } else {
          setResolved(storedUrl)
        }
      })

    return () => { cancelled = true }
  }, [storedUrl])

  return resolved
}

export function isPrivateStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return PRIVATE_BUCKET_PATTERN.test(url)
}

export async function resolveStorageUrl(storedUrl: string | null | undefined): Promise<string | null> {
  if (!storedUrl) return null
  const parsed = extractBucketAndPath(storedUrl)
  if (!parsed) return storedUrl
  const { data } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, SIGNED_URL_TTL)
  return data?.signedUrl ?? storedUrl
}

export async function batchResolveUrls(urls: (string | null | undefined)[]): Promise<(string | null)[]> {
  return Promise.all(urls.map(resolveStorageUrl))
}
