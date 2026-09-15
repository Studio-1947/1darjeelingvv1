import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import '@/i18n';
import { AuthProvider } from '@/context/AuthContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import Layout from '@/components/Layout';
import ScrollToTop from '@/components/ScrollToTop';
import { LoginGateProvider } from '@/components/LoginGate';
import SupportGate from '@/components/SupportGate';
import Support from '@/pages/Support';
import Donate from '@/pages/Donate';
import Discover from '@/pages/Discover';
import Category from '@/pages/Category';
import Nature from '@/pages/Nature';
import Culture from '@/pages/Culture';
import Eat from '@/pages/Eat';
import ListingDetail from '@/pages/ListingDetail';
import Login from '@/pages/Login';
import ProviderOnboard from '@/pages/ProviderOnboard';
import ProviderDashboard from '@/pages/ProviderDashboard';
import ProviderAccount from '@/pages/ProviderAccount';
import ProviderChats from '@/pages/ProviderChats';
import TouristDashboard from '@/pages/TouristDashboard';
import MyTrips from '@/pages/MyTrips';
import MyListings from '@/pages/MyListings';
import Saved from '@/pages/Saved';
import Refer from '@/pages/Refer';
import Notifications from '@/pages/Notifications';
import Responsible from '@/pages/Responsible';
import About from '@/pages/About';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import Refunds from '@/pages/Refunds';
import DeleteAccount from '@/pages/DeleteAccount';
import Contact from '@/pages/Contact';
import NotFound from '@/pages/NotFound';

// How long the splash in index.html stays up once the app has mounted - long enough for its
// hand-drawn wordmark reveal (1.8s, kept in sync with that markup) to actually finish playing
// rather than being cut off on a fast load.
const SPLASH_MIN_VISIBLE_MS = 1800;

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
                <Routes>
                  <Route path="/" element={<Discover />} />
                  <Route path="/spots" element={<Category typeOverride="spot" />} />
                  <Route path="/homestays" element={<Category typeOverride="homestay" />} />
                  <Route path="/drivers" element={<Category typeOverride="driver" />} />
                  <Route path="/shops" element={<Category typeOverride="shop" />} />
                  <Route path="/cafes" element={<Category typeOverride="cafe" />} />
                  <Route path="/events" element={<Category typeOverride="event" />} />
                  <Route path="/biodiversity" element={<Category typeOverride="biodiversity" />} />
                  <Route path="/nature" element={<Nature />} />
                  <Route path="/culture" element={<Culture />} />
                  <Route path="/eat" element={<Eat />} />
                  <Route path="/search" element={<Category typeOverride={undefined} />} />
                  <Route path="/listing/:id" element={<ListingDetail />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/donate" element={<Donate />} />
                  <Route path="/provider/onboard" element={<ProviderOnboard />} />
                  <Route path="/provider/dashboard" element={<ProviderDashboard />} />
                  <Route path="/provider/account" element={<ProviderAccount />} />
                  <Route path="/provider/chats" element={<ProviderChats />} />
                  <Route path="/dashboard" element={<TouristDashboard />} />
                  <Route path="/my-trips" element={<MyTrips />} />
                  <Route path="/my-listings" element={<MyListings />} />
                  <Route path="/saved" element={<Saved />} />
                  <Route path="/refer" element={<Refer />} />
                  <Route path="/notifications" element={<Notifications />} />
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
                  {/* Anything else. Without this the router matched nothing and
                      rendered an empty <main> between the header and footer. */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </SupportGate>
            </Layout>
          </LoginGateProvider>
        </BrowserRouter>
      </FavoritesProvider>
    </AuthProvider>
  );
}
