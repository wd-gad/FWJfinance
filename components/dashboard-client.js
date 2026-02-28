'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

const currencyFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

export default function DashboardClient({
  initialEntries,
  initialStart,
  initialEnd,
  initialError
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [entries, setEntries] = useState(initialEntries);
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [message, setMessage] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    occurred_on: new Date().toISOString().slice(0, 10),
    type: 'sales',
    amount: '',
    note: ''
  });

  useEffect(() => {
    setEntries(initialEntries);
    setMessage(initialError);
  }, [initialEntries, initialError]);

  const summary = useMemo(() => {
    const totals = entries.reduce(
      (accumulator, entry) => {
        if (entry.type === 'sales') {
          accumulator.sales += entry.amount;
        } else {
          accumulator.cost += entry.amount;
        }
        return accumulator;
      },
      { sales: 0, cost: 0 }
    );

    const profit = totals.sales - totals.cost;
    const margin = totals.sales > 0 ? profit / totals.sales : 0;

    return {
      sales: totals.sales,
      cost: totals.cost,
      profit,
      margin
    };
  }, [entries]);

  function handleFilterSubmit(event) {
    event.preventDefault();

    if (start && end && start > end) {
      setMessage('終了日は開始日以降を指定してください。');
      return;
    }

    setMessage('');
    startTransition(() => {
      const params = new URLSearchParams();
      if (start) {
        params.set('start', start);
      }
      if (end) {
        params.set('end', end);
      }

      const query = params.toString();
      router.replace(query ? `/dashboard?${query}` : '/dashboard');
    });
  }

  async function handleCreateEntry(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');

    const amount = Number(form.amount);
    if (!form.occurred_on || !form.type || !Number.isFinite(amount) || amount < 0) {
      setMessage('日付・区分・金額を正しく入力してください。');
      setSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('entries').insert({
      occurred_on: form.occurred_on,
      type: form.type,
      amount,
      note: form.note.trim()
    });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    setForm({
      occurred_on: new Date().toISOString().slice(0, 10),
      type: 'sales',
      amount: '',
      note: ''
    });

    startTransition(() => {
      router.refresh();
    });
    setSubmitting(false);
  }

  return (
    <div className="dashboard-grid">
      <section className="section-card">
        <div className="section-heading">
          <p className="eyebrow">Entry</p>
          <h2>売上 / 原価を登録</h2>
        </div>

        <form className="form-grid" onSubmit={handleCreateEntry}>
          <label>
            日付
            <input
              type="date"
              value={form.occurred_on}
              onChange={(event) => setForm({ ...form, occurred_on: event.target.value })}
              required
            />
          </label>
          <label>
            区分
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              required
            >
              <option value="sales">売上</option>
              <option value="cost">原価</option>
            </select>
          </label>
          <label>
            金額
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="100000"
              value={form.amount}
              onChange={(event) => setForm({ ...form, amount: event.target.value })}
              required
            />
          </label>
          <label className="full-span">
            メモ
            <input
              type="text"
              maxLength="80"
              placeholder="案件名、仕入先、備考など"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </label>
          <button type="submit" className="primary-button" disabled={submitting || isPending}>
            {submitting ? '登録中...' : '登録する'}
          </button>
        </form>
      </section>

      <section className="section-card">
        <div className="section-heading">
          <p className="eyebrow">Filter</p>
          <h2>期間で集計</h2>
        </div>

        <form className="form-grid compact-grid" onSubmit={handleFilterSubmit}>
          <label>
            開始日
            <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            終了日
            <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
          <div className="action-row">
            <button type="submit" className="primary-button" disabled={isPending}>
              {isPending ? '更新中...' : '集計する'}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setStart('');
                setEnd('');
                setMessage('');
                startTransition(() => {
                  router.replace('/dashboard');
                });
              }}
            >
              全期間に戻す
            </button>
          </div>
        </form>

        <div className="summary-grid">
          <article className="metric-card sales">
            <span>売上合計</span>
            <strong>{currencyFormatter.format(summary.sales)}</strong>
          </article>
          <article className="metric-card cost">
            <span>原価合計</span>
            <strong>{currencyFormatter.format(summary.cost)}</strong>
          </article>
          <article className="metric-card profit">
            <span>粗利</span>
            <strong>{currencyFormatter.format(summary.profit)}</strong>
          </article>
          <article className="metric-card margin">
            <span>粗利率</span>
            <strong>{percentFormatter.format(summary.margin)}</strong>
          </article>
        </div>
      </section>

      <section className="section-card full-width">
        <div className="section-heading">
          <p className="eyebrow">Ledger</p>
          <h2>取引一覧</h2>
        </div>

        {(start || end) && (
          <p className="status-line">
            {start || '開始指定なし'} から {end || '終了指定なし'} の範囲で表示しています。
          </p>
        )}
        {message && <p className="status-line error">{message}</p>}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>区分</th>
                <th>金額</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.occurred_on}</td>
                    <td>
                      <span className={`pill ${entry.type}`}>
                        {entry.type === 'sales' ? '売上' : '原価'}
                      </span>
                    </td>
                    <td>{currencyFormatter.format(entry.amount)}</td>
                    <td>{entry.note || '-'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-cell">
                    まだ取引がありません。まずは上のフォームから登録してください。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
