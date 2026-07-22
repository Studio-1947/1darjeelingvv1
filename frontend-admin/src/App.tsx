import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Admin from '@/pages/Admin';
import AdminLogin from '@/pages/AdminLogin';
import KycReview from '@/pages/KycReview';

// Nav entries shown for any authenticated admin page. Add new protected
// pages here to have them appear in the top nav automatically.
const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/kyc', label: 'KYC Review' },
];

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-16 text-center text-ink-soft">Loading...</div>;
  }

  if (!user || user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <nav className="border-b border-[var(--line)] bg-white">
        <div className="mx-auto max-w-7xl px-4 md:px-8 py-3 flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-bold transition-all ${
                location.pathname === link.to ? 'text-flag' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {link.label}
            </Link>
          ))}
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
          {/* Fallback to dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
