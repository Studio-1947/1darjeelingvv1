import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import '@/i18n';
import { AuthProvider } from '@/context/AuthContext';
import Layout from '@/components/Layout';
import Discover from '@/pages/Discover';
import Category from '@/pages/Category';
import ListingDetail from '@/pages/ListingDetail';
import Login from '@/pages/Login';
import ProviderOnboard from '@/pages/ProviderOnboard';
import ProviderDashboard from '@/pages/ProviderDashboard';
import TouristDashboard from '@/pages/TouristDashboard';
import Responsible from '@/pages/Responsible';
import Privacy from '@/pages/Privacy';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
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
            <Route path="/provider/onboard" element={<ProviderOnboard />} />
            <Route path="/provider/dashboard" element={<ProviderDashboard />} />
            <Route path="/dashboard" element={<TouristDashboard />} />
            <Route path="/responsible" element={<Responsible />} />
            <Route path="/privacy" element={<Privacy />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
