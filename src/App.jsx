import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { LanguageProvider } from './context/LanguageContext'
import { ThemeProvider } from './context/ThemeContext'
import { SiteContentProvider } from './context/SiteContentContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { FleetProvider } from './context/FleetContext'

import PublicLayout from './layouts/PublicLayout'
import AppLayout from './layouts/AppLayout'

import Landing from './pages/Landing'
import Login from './pages/Login'
import ControlCenter from './pages/app/ControlCenter'
import Dashboard from './pages/app/Dashboard'
import VehicleDashboard from './pages/app/VehicleDashboard'
import LiveMap from './pages/app/LiveMap'
import HistoryMap from './pages/app/HistoryMap'
import Reports from './pages/app/Reports'
import Alerts from './pages/app/Alerts'
import Management from './pages/app/Management'
import SuperAdmin from './pages/admin/SuperAdmin'
import NotFound from './pages/NotFound'

/** Held while the session cookie is being checked — redirecting first would
    bounce a signed-in user to /login on every refresh. */
function SessionGate() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--s-bg)]">
      <span className="size-8 animate-spin rounded-full border-2 border-brand-500/25 border-t-brand-500" />
    </div>
  )
}

function RequireAdmin({ children }) {
  const { isAuthed, isAdmin, loading } = useAuth()
  const location = useLocation()
  if (loading) return <SessionGate />
  if (!isAuthed) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (!isAdmin) return <Navigate to="/app" replace />
  return children
}

function RequireAuth({ children }) {
  const { isAuthed, loading } = useAuth()
  const location = useLocation()
  if (loading) return <SessionGate />
  if (!isAuthed) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return children
}

/**
 * A page an account was granted.
 *
 * The address bar is a door like any other: hiding a card in the control centre
 * while `/app/reports` still answers would be decoration, not access control.
 * Someone who types a path they were not granted lands back on the control
 * centre, where they can see what they *do* have.
 *
 * This is convenience and honesty, not security — the API enforces roles on
 * every request of its own accord, and always did.
 */
function RequirePage({ page, children }) {
  const { can } = useAuth()
  if (!can(page)) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
      <SiteContentProvider>
      <LanguageProvider>
        <AuthProvider>
          <FleetProvider>
            <Routes>
              <Route element={<PublicLayout />}>
                <Route index element={<Landing />} />
              </Route>

              <Route path="/login" element={<Login />} />

              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <SuperAdmin />
                  </RequireAdmin>
                }
              />

              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <AppLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<ControlCenter />} />
                <Route path="dashboard" element={<RequirePage page="dashboard"><Dashboard /></RequirePage>} />
                {/* بطاقة المركبة امتداد للوحة المؤشرات، فتتبع صلاحيتها */}
                <Route path="vehicle/:id" element={<RequirePage page="dashboard"><VehicleDashboard /></RequirePage>} />
                <Route path="map" element={<RequirePage page="map"><LiveMap /></RequirePage>} />
                <Route path="history" element={<RequirePage page="history"><HistoryMap /></RequirePage>} />
                <Route path="reports" element={<RequirePage page="reports"><Reports /></RequirePage>} />
                <Route path="alerts" element={<RequirePage page="alerts"><Alerts /></RequirePage>} />
                {/* بلا حارس: هذه الشاشة تحمل الملف الشخصي أيضًا، وهو ملك كل
                    حساب. أقسام إدارة الأسطول داخلها هي المحروسة بصلاحية
                    «الإدارة»، وكل كتابة فيها يحرسها الدور على السيرفر */}
                <Route path="management" element={<Management />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </FleetProvider>
        </AuthProvider>
      </LanguageProvider>
      </SiteContentProvider>
    </ThemeProvider>
  )
}
