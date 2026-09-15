import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import '@/i18n';
import { AuthProvider } from '@/context/AuthContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import Layout from '@/components/Layout';
import ScrollToTop from '@/components/ScrollToTop';
import { LoginGateProvider } from '@/components/LoginGate';
import SupportGate from '@/components/SupportGate';

const Support = lazy(() => import('@/pages/Support'));
const Donate = lazy(() => import('@/pages/Donate'));
const Discover = lazy(() => import('@/pages/Discover'));
const Category = lazy(() => import('@/pages/Category'));
const ListingDetail = lazy(() => import('@/pages/ListingDetail'));
const Login = lazy(() => import('@/pages/Login'));
const ProviderOnboard = lazy(() => import('@/pages/ProviderOnboard'));
const ProviderDashboard = lazy(() => import('@/pages/ProviderDashboard'));
const TouristDashboard = lazy(() => import('@/pages/TouristDashboard'));
const MyTrips = lazy(() => import('@/pages/MyTrips'));
const MyListings = lazy(() => import('@/pages/MyListings'));
const Saved = lazy(() => import('@/pages/Saved'));
const Responsible = lazy(() => import('@/pages/Responsible'));
const About = lazy(() => import('@/pages/About'));
const Privacy = lazy(() => import('@/pages/Privacy'));
const Terms = lazy(() => import('@/pages/Terms'));
const Refunds = lazy(() => import('@/pages/Refunds'));
const DeleteAccount = lazy(() => import('@/pages/DeleteAccount'));
const Contact = lazy(() => import('@/pages/Contact'));
const NotFound = lazy(() => import('@/pages/NotFound'));

export default function App() {
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
                    <Route path="/" element={<Discover />} />
                    <Route path="/spots" element={<Category typeOverride="spot" />} />
                    <Route path="/homestays" element={<Category typeOverride="homestay" />} />
                    <Route path="/drivers" element={<Category typeOverride="driver" />} />
                    <Route path="/shops" element={<Category typeOverride="shop" />} />
                    <Route path="/cafes" element={<Category typeOverride="cafe" />} />
                    <Route path="/events" element={<Category typeOverride="event" />} />
                    <Route path="/biodiversity" element={<Category typeOverride="biodiversity" />} />
                    <Route path="/search" element={<Category typeOverride={undefined} />} />
                    <Route path="/listing/:id" element={<ListingDetail />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/donate" element={<Donate />} />
                    <Route path="/provider/onboard" element={<ProviderOnboard />} />
                    <Route path="/provider/dashboard" element={<ProviderDashboard />} />
                    <Route path="/dashboard" element={<TouristDashboard />} />
                    <Route path="/my-trips" element={<MyTrips />} />
                    <Route path="/my-listings" element={<MyListings />} />
                    <Route path="/saved" element={<Saved />} />
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
                </Suspense>
              </SupportGate>
            </Layout>
          </LoginGateProvider>
        </BrowserRouter>
      </FavoritesProvider>
    </AuthProvider>
  );
}
