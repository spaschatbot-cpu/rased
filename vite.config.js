import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import devApi from './dev-api'

/**
 * `--mode phone` serves the dev server to a real handset on the same network.
 *
 * It exists because the driver app cannot be tested on a laptop. A desktop
 * browser has no satellite receiver: it locates itself from surrounding wifi
 * networks and reports the result honestly as accurate to several hundred
 * metres. Every address derived from a fix like that names a street the driver
 * is nowhere near, and no amount of work on the geocoder changes it — the error
 * is already in the coordinate before any of our code sees it.
 *
 * Two things have to be true for a phone to reach it, and both are why this
 * mode is not the default:
 *
 *   • **It listens on the network,** not just on loopback. That is a change in
 *     exposure, so it is opt-in rather than something every `npm run dev`
 *     quietly does on whatever café wifi the laptop is joined to.
 *   • **It serves HTTPS.** Browsers refuse geolocation on a plain-http origin
 *     unless it is localhost, so the http URL would load the app and then fail
 *     at the only thing being tested. The certificate is self-signed and the
 *     phone will warn once; accepting it makes the origin a secure context,
 *     which is all the geolocation API asks for.
 *
 * The default `npm run dev` is untouched: plain http on localhost, which is a
 * secure context by definition and needs none of this.
 */
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), devApi(), ...(mode === 'phone' ? [basicSsl()] : [])],
  server: {
    /* the port the docs, the README and the driver app's own fallback all use */
    port: 5180,
    open: mode !== 'phone',
    host: mode === 'phone',
  },
  build: {
    rollupOptions: {
      output: {
        // keep the heavy map/chart libs out of the main bundle
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          maps: ['leaflet', 'react-leaflet'],
          charts: ['recharts'],
        },
      },
    },
  },
}))
