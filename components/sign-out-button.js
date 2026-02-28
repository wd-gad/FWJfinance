'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  return (
    <button type="button" className="secondary-button" onClick={handleSignOut} disabled={loading}>
      {loading ? 'サインアウト中...' : 'サインアウト'}
    </button>
  );
}
