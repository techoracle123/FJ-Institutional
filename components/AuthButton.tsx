'use client';
import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabase';

export default function AuthButton() {
  const { user, loading } = useAuth();
  if (loading) return null;

  if (!user) return (
    <Link href="/account" className="hidden text-[11.5px] font-medium transition-colors hover:text-[var(--color-accent)] sm:block"
      style={{ color: 'var(--color-tertiary)' }}>Sign in</Link>
  );

  return (
    <button onClick={() => supabase.auth.signOut()}
      title={user.email ?? ''}
      className="hidden h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-opacity hover:opacity-80 sm:flex"
      style={{ background: 'var(--color-overlay)', color: 'var(--color-accent)' }}>
      {(user.email ?? '?')[0].toUpperCase()}
    </button>
  );
}
