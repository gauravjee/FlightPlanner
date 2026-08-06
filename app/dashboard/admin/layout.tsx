// app/dashboard/admin/layout.tsx
// Forces all admin pages to be dynamic (no static generation)
// This prevents SSR errors from Supabase client imports

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}