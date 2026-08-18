import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
/* Leaflet's own stylesheet, from the package rather than a CDN. It used to
   come off unpkg, which made the map's layout depend at runtime on a host
   nobody here operates: if unpkg is slow the tiles stack unstyled, and if it
   is down the map is a pile of broken boxes. It is a dependency already —
   Vite bundles and fingerprints it like any other asset, and the version can
   no longer drift from the one in package.json. */
import 'leaflet/dist/leaflet.css'

/* The two families, self-hosted. These are the same weights index.html used to
   pull from Google Fonts, and the same bytes the browser downloaded anyway —
   moved to this origin. Each weight's stylesheet declares its subsets with a
   unicode-range, so an Arabic page never fetches the Latin cut, or the reverse.

   Worth being explicit about: this list must stay in step with the weights the
   design actually uses. A weight that is styled but not imported does not fail
   loudly — the browser silently synthesises a bolder face, which looks nearly
   right and is why nobody notices. */
import '@fontsource/tajawal/400.css'
import '@fontsource/tajawal/500.css'
import '@fontsource/tajawal/700.css'
import '@fontsource/tajawal/800.css'
import '@fontsource/tajawal/900.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
