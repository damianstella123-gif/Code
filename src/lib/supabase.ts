import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://vbsligpuwjzvywkpkhdn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZic2xpZ3B1d2p6dnl3a3BraGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDIyNDAsImV4cCI6MjA5NjgxODI0MH0.YaHlfxvKtht8WSg9xWxT3nrFxsJAmC4HcgunLqZwiOQ',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  }
)
