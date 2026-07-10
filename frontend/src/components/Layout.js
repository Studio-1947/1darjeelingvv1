import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import BottomNav from '@/components/BottomNav';

export default function Layout({ children }) {
  return (
    <div className="App min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
