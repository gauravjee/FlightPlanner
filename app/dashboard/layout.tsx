// app/dashboard/layout.tsx
// Forces all dashboard pages to be dynamic (no static generation)
// This prevents SSR errors from Supabase client imports

export const dynamic = 'force-dynamic';
export const revalidate = 0;


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  );
}