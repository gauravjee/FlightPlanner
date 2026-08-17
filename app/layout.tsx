// ============================================================
// app/layout.tsx - ROOT LAYOUT
// ============================================================
// Purpose: The root HTML structure that wraps every page.
//          Sets up fonts, metadata for SEO, and global styles.
//          This is a SERVER COMPONENT (no 'use client').
// ============================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
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
    // suppressHydrationWarning is required here specifically because the
    // theme-init script above intentionally sets data-theme on this element
    // outside of React's render (before hydration runs), so its value on
    // the client legitimately differs from what the server rendered. This
    // does NOT suppress hydration warnings for anything else — the prop
    // only affects this one element's own attributes, not its children.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets data-theme on <html> before first paint, so the page never
            flashes the wrong theme. Reads the same 'fp-theme' localStorage
            key that lib/store.ts's setTheme() writes to; falls back to
            dark (the default theme) if nothing's stored yet or storage
            isn't available. Uses next/script's beforeInteractive strategy —
            Next.js's sanctioned way to inject a render-blocking inline
            script from a Server Component (a raw <script> tag here logs a
            "scripts inside React components are never executed" warning
            and isn't guaranteed to survive re-renders the way this is). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('fp-theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`}
        </Script>
      </head>
      {/* Apply Inter font to entire body */}
      <body className={inter.className}>
          <AuthProvider>
            {children}
          </AuthProvider>
      </body>
    </html>
  );
}