import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import '@/i18n';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import TravellerOnly from '@/components/TravellerOnly';
import { FavoritesProvider } from '@/context/FavoritesContext';
import Layout from '@/components/Layout';
import ScrollToTop from '@/components/ScrollToTop';
import { LoginGateProvider } from '@/components/LoginGate';
import SupportGate from '@/components/SupportGate';
import Policies from '@/pages/Policies';

const Support = lazy(() => import('@/pages/Support'));
const Donate = lazy(() => import('@/pages/Donate'));
const Discover = lazy(() => import('@/pages/Discover'));
const Category = lazy(() => import('@/pages/Category'));
const ListingDetail = lazy(() => import('@/pages/ListingDetail'));
const Login = lazy(() => import('@/pages/Login'));
const ProviderOnboard = lazy(() => import('@/pages/ProviderOnboard'));
const ProviderDashboard = lazy(() => import('@/pages/ProviderDashboard'));
const ProviderProfile = lazy(() => import('@/pages/ProviderProfile'));
const TouristDashboard = lazy(() => import('@/pages/TouristDashboard'));
const MyTrips = lazy(() => import('@/pages/MyTrips'));
const MyListings = lazy(() => import('@/pages/MyListings'));
const Saved = lazy(() => import('@/pages/Saved'));
const Feed = lazy(() => import('@/pages/Feed'));
const Responsible = lazy(() => import('@/pages/Responsible'));
const About = lazy(() => import('@/pages/About'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const Refunds = lazy(() => import('@/pages/Refunds'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const Contact = lazy(() => import('@/pages/Contact'));
const NotFound = lazy(() => import('@/pages/NotFound'));

// How long the splash in index.html stays up once the app has mounted - long enough for its
// wordmark reveal (1.8s, kept in sync with that markup) to actually finish playing rather
// than being cut off on a fast load.
const SPLASH_MIN_VISIBLE_MS = 1800;

/** Home is Discover for a traveller; on the business side it is the host's own dashboard. */
function HomeForSide() {
  const { isHostMode } = useAuth();
  return isHostMode ? <Navigate to="/provider/dashboard" replace /> : <Discover />;
}

export default function App() {
  React.useEffect(() => {
    const splash = document.getElementById('app-splash');
    if (!splash) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const delay = reduceMotion ? 0 : SPLASH_MIN_VISIBLE_MS;
    const hide = setTimeout(() => {
      splash.classList.add('app-splash-hide');
      setTimeout(() => splash.remove(), 300);
    }, delay);
    return () => clearTimeout(hide);
  }, []);

  return (
    <AuthProvider>
      <FavoritesProvider>
        <BrowserRouter>
          <ScrollToTop />
          <LoginGateProvider>
            <Layout>
              <SupportGate>
                <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
                  <Routes>
                    <Route path="/" element={<HomeForSide />} />
                    <Route path="/spots" element={<TravellerOnly><Category typeOverride="spot" /></TravellerOnly>} />
                    <Route path="/homestays" element={<TravellerOnly><Category typeOverride="homestay" /></TravellerOnly>} />
                    <Route path="/drivers" element={<TravellerOnly><Category typeOverride="driver" /></TravellerOnly>} />
                    <Route path="/guides" element={<TravellerOnly><Category typeOverride="guide" /></TravellerOnly>} />
                    <Route path="/shops" element={<TravellerOnly><Category typeOverride="shop" /></TravellerOnly>} />
                    <Route path="/cafes" element={<TravellerOnly><Category typeOverride="cafe" /></TravellerOnly>} />
                    <Route path="/events" element={<TravellerOnly><Category typeOverride="event" /></TravellerOnly>} />
                    <Route path="/biodiversity" element={<TravellerOnly><Category typeOverride="biodiversity" /></TravellerOnly>} />
                    <Route path="/search" element={<TravellerOnly><Category typeOverride={undefined} /></TravellerOnly>} />
                    <Route path="/listing/:id" element={<ListingDetail />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/support" element={<TravellerOnly><Support /></TravellerOnly>} />
                    <Route path="/donate" element={<Donate />} />
                    <Route path="/provider/onboard" element={<ProviderOnboard />} />
                    <Route path="/provider/dashboard" element={<ProviderDashboard />} />
                    <Route path="/provider/profile" element={<ProviderProfile />} />
                    <Route path="/dashboard" element={<TravellerOnly><TouristDashboard /></TravellerOnly>} />
                    <Route path="/my-trips" element={<TravellerOnly><MyTrips /></TravellerOnly>} />
                    <Route path="/my-listings" element={<MyListings />} />
                    <Route path="/saved" element={<TravellerOnly><Saved /></TravellerOnly>} />
                  <Route path="/feed" element={<Feed />} />
                    <Route path="/responsible" element={<Responsible />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/privacy" element={<Privacy />} />
                    {/* Razorpay will not activate a live account without a reachable Terms, Refund
                        and Contact/Grievance page, and the Consumer Protection (E-Commerce) Rules
                        require the grievance route regardless of the gateway. */}
                    <Route path="/terms" element={<Terms />} />
                    <Route path="/refunds" element={<Refunds />} />
                    <Route path="/delete-account" element={<DeleteAccount />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/policies" element={<Policies />} />
                    {/* Anything else. Without this the router matched nothing and
                        rendered an empty <main> between the header and footer. */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </SupportGate>
            </Layout>
          </LoginGateProvider>
        </BrowserRouter>
      </FavoritesProvider>
    </AuthProvider>
  );
}
