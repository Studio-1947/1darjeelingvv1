import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Admin from '@/pages/Admin';
import AdminLogin from '@/pages/AdminLogin';
import KycReview from '@/pages/KycReview';
import Moderation from '@/pages/Moderation';
import Feedback from '@/pages/Feedback';
import Deliveries from '@/pages/Deliveries';
import PushNotifications from '@/pages/PushNotifications';

// Nav entries shown for any authenticated admin page. Add new protected
// pages here to have them appear in the top nav automatically.
const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/kyc', label: 'KYC Review' },
  { to: '/moderation', label: 'Moderation' },
  { to: '/feedback', label: 'Feedback' },
  { to: '/deliveries', label: 'Deliveries' },
  { to: '/notifications', label: 'Notifications' },
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const nav = useNavigate();

  if (loading) {
    return <div className="p-16 text-center text-ink-soft">Loading...</div>;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <nav className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-3 flex items-center gap-6 overflow-x-auto">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-bold whitespace-nowrap transition-all ${
                location.pathname === link.to ? 'text-flag' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {/* Signing out from any screen, not only the dashboard. */}
          <button type="button" onClick={() => { logout(); nav('/login'); }} data-testid="nav-logout"
            className="ml-auto text-sm font-bold whitespace-nowrap text-ink-soft hover:text-flag">
            Log out
          </button>
        </div>
      </nav>
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<AdminLogin />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/kyc"
            element={
              <ProtectedRoute>
                <KycReview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/moderation"
            element={
              <ProtectedRoute>
                <Moderation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/feedback"
            element={
              <ProtectedRoute>
                <Feedback />
              </ProtectedRoute>
            }
          />
          <Route
            path="/deliveries"
            element={
              <ProtectedRoute>
                <Deliveries />
              </ProtectedRoute>
            }
          />
          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <PushNotifications />
              </ProtectedRoute>
            }
          />
          {/* Fallback to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
