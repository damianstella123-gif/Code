import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

let channelCounter = 0

export function useRealtimeTable(table: string, onUpdate: () => void) {
  const callbackRef = useRef(onUpdate)
  callbackRef.current = onUpdate

  useEffect(() => {
    const id = ++channelCounter
    const channel = supabase
      .channel(`realtime-${table}-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => { callbackRef.current() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table])
}

export function useRealtimeRefresh(tables: string[]): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const channels = tables.map((table, i) =>
      supabase
        .channel(`rt-refresh-${table}-${i}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => { setTick(t => t + 1) }
        )
        .subscribe()
    )

    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  }, [tables.join(',')])

  return tick
}
