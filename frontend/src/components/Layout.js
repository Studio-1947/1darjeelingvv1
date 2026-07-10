import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function Layout({ children }) {
  return (
    <div className="App min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
