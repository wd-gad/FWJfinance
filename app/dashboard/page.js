import DashboardClient from '@/components/dashboard-client';
import SignOutButton from '@/components/sign-out-button';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: entries, error } = await supabase
    .from('entries')
    .select(
      'id, customer_name, occurred_on, payment_date, deposit_due_on, payment_completed, deposit_completed, type, amount, note, created_at'
    )
    .order('occurred_on', { ascending: false })
    .order('created_at', { ascending: false });

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
        initialError={error?.message ?? ''}
      />
    </main>
  );
}
