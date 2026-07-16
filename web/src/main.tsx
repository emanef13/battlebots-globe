import { inject } from '@vercel/analytics'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { TRACKING_OFF } from './analytics'

// /admin renders the analytics dashboard instead of the globe; lazy so
// regular visitors never download it
const Admin = lazy(() => import('./admin/Admin.tsx'))
const isAdmin = window.location.pathname === '/admin'

if (!isAdmin && !TRACKING_OFF) inject()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? (
      <Suspense fallback={null}>
        <Admin />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
