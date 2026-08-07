// ============================================================
// app/layout.tsx - ROOT LAYOUT
// ============================================================
// Purpose: The root HTML structure that wraps every page.
//          Sets up fonts, metadata for SEO, and global styles.
//          This is a SERVER COMPONENT (no 'use client').
// ============================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';  // Import global CSS styles
import AuthProvider from '@/components/ui/AuthProvider';

// ----- Font Configuration -----
// Load Inter font with Latin subset for performance
const inter = Inter({ subsets: ['latin'] });

// ----- Page Metadata (SEO) -----
export const metadata: Metadata = {
  title: 'FlightPro Manager',  // Browser tab title
  description: 'Flight Training Organization Management System',  // SEO description
   icons: {
    icon: '/flightpro-favicon.ico',
  },
};

// ============================================================
// ROOT LAYOUT COMPONENT
// Wraps all pages with HTML structure and font
// ============================================================
export default function RootLayout({
  children,  // The page content passed as children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Apply Inter font to entire body */}
      <body className={inter.className}>
          <AuthProvider>
            {children}
          </AuthProvider>
      </body>
    </html>
  );
}