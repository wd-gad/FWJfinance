# Ledger Flow

Supabase認証付きの会計アプリです。トップページから Google SSO でサインインし、認証済みユーザーだけが会計ダッシュボードにアクセスできます。

## Setup

1. `cp .env.example .env.local`
2. `.env.local` に Supabase の URL と anon key を入れる
3. Supabase SQL Editor で `supabase/schema.sql` を実行する
4. Supabase Authentication で Google provider を有効化する
5. Supabase の Redirect URLs に `http://localhost:3000/auth/callback` と本番URLを追加する
6. `npm run dev`

## Vercel

1. GitHubへpushする
2. VercelでこのリポジトリをImportする
3. `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定する
4. Deployする
