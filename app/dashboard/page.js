import DashboardClient from '@/components/dashboard-client';
import SignOutButton from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const start = typeof params?.start === 'string' ? params.start : '';
  const end = typeof params?.end === 'string' ? params.end : '';
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let query = supabase
    .from('entries')
    .select('id, occurred_on, type, amount, note, created_at')
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

  if (start) {
    query = query.gte('occurred_on', start);
  }

  if (end) {
    query = query.lte('occurred_on', end);
  }

  const { data: entries, error } = await query;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Authenticated Workspace</p>
          <h1>会計ダッシュボード</h1>
          <p className="lead compact">
            {user?.email || 'Signed in user'} としてサインイン中です。売上と原価を入力して、指定期間で集計できます。
          </p>
        </div>
        <SignOutButton />
      </header>

      <DashboardClient
        initialEntries={entries ?? []}
        initialStart={start}
        initialEnd={end}
        initialError={error?.message ?? ''}
      />
    </main>
  );
}
