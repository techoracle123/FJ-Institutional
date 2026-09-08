'use client';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabase';
import AuthPanel from '@/components/AuthPanel';
import { Panel, Stat } from '@/components/ui';

export default function Account() {
  const { user, loading } = useAuth();
  if (loading) return <div className="skeleton h-56 w-full" />;

  return (
    <div className="space-y-5">
      <h1 className="text-[26px] font-semibold leading-none tracking-tight">Account</h1>
      {!user ? (
        <AuthPanel message="One account gives you the journal, saved theses and alerts. Free, always." />
      ) : (
        <Panel dense>
          <div className="space-y-4 px-4 py-4">
            <div className="grid grid-cols-2 gap-px">
              <Stat label="Email">{user.email}</Stat>
              <Stat label="Member since">{new Date(user.created_at).toLocaleDateString()}</Stat>
            </div>
            <button onClick={() => supabase.auth.signOut()}
              className="rounded-[3px] px-3 py-2 text-[12px] font-medium transition-colors"
              style={{ border: '1px solid var(--color-hairline)', color: 'var(--color-secondary)' }}>
              Sign out
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
