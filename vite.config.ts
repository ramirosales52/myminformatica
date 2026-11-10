import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  let role = ''
  if (key.startsWith('eyJ')) {
    try {
      role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role || ''
    } catch {
      /* La validación de conexión informa una clave inválida. */
    }
  }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error(
      'Configuración insegura: nunca se puede usar una clave secreta/service_role en VITE_. Usá la clave publicable de Supabase.',
    )
  }
  return {
    server: {
      host: '127.0.0.1',
    },
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'supabase', test: /node_modules\/@supabase\// },
              { name: 'react-vendor', test: /node_modules\/(react|react-dom|scheduler)\// },
              { name: 'dates', test: /node_modules\/(date-fns|date-fns-tz)\// },
            ],
          },
        },
      },
    },
  }
})
