import Link from 'next/link';
import { redirect } from 'next/navigation';
import SignInButton from '@/components/sign-in-button';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="landing-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Vercel + Supabase</p>
          <h1>売上と原価を、認証付きでどこからでも管理する。</h1>
          <p className="lead">
            トップページからGoogle SSOでサインインし、認証済みユーザーだけが会計ダッシュボードに進めます。
            登録した取引は Supabase に保存され、Vercel にデプロイすればブラウザから利用できます。
          </p>
          <div className="cta-row">
            <SignInButton />
            <Link href="#features" className="ghost-link">
              機能を見る
            </Link>
          </div>
        </div>
        <div className="hero-panel">
          <span className="panel-label">初期機能</span>
          <ul className="feature-list">
            <li>Google SSO サインイン</li>
            <li>未認証ユーザーのアクセス制御</li>
            <li>売上 / 原価の登録</li>
            <li>期間指定での集計</li>
          </ul>
        </div>
      </section>

      <section id="features" className="info-grid">
        <article className="info-card">
          <p className="eyebrow">Secure</p>
          <h2>認証していないユーザーはダッシュボードに入れません。</h2>
          <p>ミドルウェアとサーバー側チェックの両方で、未認証時はトップページへ戻します。</p>
        </article>
        <article className="info-card">
          <p className="eyebrow">Accounting</p>
          <h2>売上と原価を保存し、粗利と粗利率を期間ごとに確認できます。</h2>
          <p>明細一覧と集計カードで、最低限の会計確認をすぐ開始できます。</p>
        </article>
      </section>
    </main>
  );
}
