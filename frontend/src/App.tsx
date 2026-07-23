import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import '@/i18n';
import { AuthProvider } from '@/context/AuthContext';
import { FavoritesProvider } from '@/context/FavoritesContext';
import Layout from '@/components/Layout';
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
import Saved from '@/pages/Saved';
import Responsible from '@/pages/Responsible';
import Privacy from '@/pages/Privacy';

export default function App() {
  return (
    <AuthProvider>
      <FavoritesProvider>
        <BrowserRouter>
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
                <Route path="/saved" element={<Saved />} />
                <Route path="/responsible" element={<Responsible />} />
                <Route path="/privacy" element={<Privacy />} />
              </Routes>
            </SupportGate>
          </Layout>
        </BrowserRouter>
      </FavoritesProvider>
    </AuthProvider>
  );
}
