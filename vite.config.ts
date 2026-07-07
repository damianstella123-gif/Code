import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_SUPABASE_URL':
      JSON.stringify('https://vbsligpuwjzvywkpkhdn.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY':
      JSON.stringify('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZic2xpZ3B1d2p6dnl3a3BraGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDIyNDAsImV4cCI6MjA5NjgxODI0MH0.YaHlfxvKtht8WSg9xWxT3nrFxsJAmC4HcgunLqZwiOQ'),
  },
})
