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
import ListingDetail from '@/pages/ListingDetail';
import Login from '@/pages/Login';
import ProviderOnboard from '@/pages/ProviderOnboard';
import ProviderDashboard from '@/pages/ProviderDashboard';
import TouristDashboard from '@/pages/TouristDashboard';
import MyTrips from '@/pages/MyTrips';
import MyListings from '@/pages/MyListings';
import Saved from '@/pages/Saved';
import Responsible from '@/pages/Responsible';
import About from '@/pages/About';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import Refunds from '@/pages/Refunds';
import Contact from '@/pages/Contact';

export default function App() {
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
                  <Route path="/contact" element={<Contact />} />
                </Routes>
              </SupportGate>
            </Layout>
          </LoginGateProvider>
        </BrowserRouter>
      </FavoritesProvider>
    </AuthProvider>
  );
}
