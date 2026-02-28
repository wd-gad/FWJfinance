import './globals.css';

export const metadata = {
  title: 'Ledger Flow',
  description: 'Supabase認証付きの会計アプリ'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
