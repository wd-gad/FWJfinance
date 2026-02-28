'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export default function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo
      }
    });

    if (error) {
      window.alert(`サインインに失敗しました: ${error.message}`);
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={handleSignIn} className="primary-button" disabled={loading}>
      {loading ? '接続中...' : 'Googleでサインイン'}
    </button>
  );
}
