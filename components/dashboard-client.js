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
  initialCustomers,
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
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    customer_name: '',
    occurred_on: new Date().toISOString().slice(0, 10),
    payment_date: '',
    deposit_due_on: '',
    type: '',
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

  const customerOptions = useMemo(() => {
    return [...new Set(initialCustomers.map((entry) => entry.customer_name?.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'ja'));
  }, [initialCustomers]);
  const currentEditingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) ?? null,
    [editingId, entries]
  );

  const isSales = form.type === 'sales';
  const isCost = form.type === 'cost';

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
    if (
      !form.customer_name.trim() ||
      !form.occurred_on ||
      !form.type ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      setMessage('取引先名・日付・区分・金額を正しく入力してください。');
      setSubmitting(false);
      return;
    }

    if (isSales && !form.deposit_due_on) {
      setMessage('売上では入金予定日が必須です。');
      setSubmitting(false);
      return;
    }

    if (isCost && !form.payment_date) {
      setMessage('原価では支払日付が必須です。');
      setSubmitting(false);
      return;
    }

    const supabase = createClient();
    const payload = {
      customer_name: form.customer_name.trim(),
      occurred_on: form.occurred_on,
      payment_date: isCost ? form.payment_date || null : null,
      deposit_due_on: isSales ? form.deposit_due_on || null : null,
      payment_completed:
        isCost && currentEditingEntry?.type === 'cost'
          ? currentEditingEntry.payment_completed
          : false,
      deposit_completed:
        isSales && currentEditingEntry?.type === 'sales'
          ? currentEditingEntry.deposit_completed
          : false,
      type: form.type,
      amount,
      note: form.note.trim()
    };

    const { error } = editingId
      ? await supabase.from('entries').update(payload).eq('id', editingId)
      : await supabase.from('entries').insert(payload);

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    setForm({
      customer_name: '',
      occurred_on: new Date().toISOString().slice(0, 10),
      payment_date: '',
      deposit_due_on: '',
      type: '',
      amount: '',
      note: ''
    });
    setEditingId(null);
    startTransition(() => {
      router.refresh();
    });
    setSubmitting(false);
  }

  function handleEditEntry(entry) {
    setEditingId(entry.id);
    setMessage('');
    setForm({
      customer_name: entry.customer_name || '',
      occurred_on: entry.occurred_on || new Date().toISOString().slice(0, 10),
      payment_date: entry.payment_date || '',
      deposit_due_on: entry.deposit_due_on || '',
      type: entry.type || '',
      amount: String(entry.amount ?? ''),
      note: entry.note || ''
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setMessage('');
    setForm({
      customer_name: '',
      occurred_on: new Date().toISOString().slice(0, 10),
      payment_date: '',
      deposit_due_on: '',
      type: '',
      amount: '',
      note: ''
    });
  }

  async function handleDeleteEntry(entryId) {
    const confirmed = window.confirm('この取引を削除しますか？');
    if (!confirmed) {
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('entries').delete().eq('id', entryId);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (editingId === entryId) {
      handleCancelEdit();
    }

    setEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));

    startTransition(() => {
      router.refresh();
    });
  }

  async function handleSettlementChange(entry, nextStatus) {
    const supabase = createClient();
    const payload =
      entry.type === 'sales'
        ? { deposit_completed: nextStatus === 'completed' }
        : { payment_completed: nextStatus === 'completed' };
    const { error } = await supabase.from('entries').update(payload).eq('id', entry.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEntries((currentEntries) =>
      currentEntries.map((currentEntry) =>
        currentEntry.id === entry.id
          ? {
              ...currentEntry,
              ...payload
            }
          : currentEntry
      )
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="section-card">
        <div className="section-heading">
          <p className="eyebrow">Entry</p>
          <h2>{editingId ? '取引を編集' : '売上 / 原価を登録'}</h2>
        </div>

        <form className="form-grid" onSubmit={handleCreateEntry}>
          <label>
            取引先名
            <input
              type="text"
              list="customer-options"
              placeholder="株式会社サンプル"
              value={form.customer_name}
              onChange={(event) => setForm({ ...form, customer_name: event.target.value })}
              required
            />
            <datalist id="customer-options">
              {customerOptions.map((customerName) => (
                <option key={customerName} value={customerName} />
              ))}
            </datalist>
          </label>
          <label>
            取引日
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
              onChange={(event) => {
                const nextType = event.target.value;
                setForm({
                  ...form,
                  type: nextType,
                  payment_date: nextType === 'cost' ? form.payment_date : '',
                  deposit_due_on: nextType === 'sales' ? form.deposit_due_on : ''
                });
              }}
              required
            >
              <option value="">選択してください</option>
              <option value="sales">売上</option>
              <option value="cost">原価</option>
            </select>
          </label>
          <label>
            支払日付 {isCost ? '必須' : '任意'}
            <input
              type="date"
              value={form.payment_date}
              onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
              required={isCost}
              disabled={!isCost}
              readOnly={!isCost}
            />
          </label>
          <label>
            入金予定日 {isSales ? '必須' : '任意'}
            <input
              type="date"
              value={form.deposit_due_on}
              onChange={(event) => setForm({ ...form, deposit_due_on: event.target.value })}
              required={isSales}
              disabled={!isSales}
              readOnly={!isSales}
            />
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
          <div className="action-row">
            <button type="submit" className="primary-button" disabled={submitting || isPending}>
              {submitting ? editingId ? '更新中...' : '登録中...' : editingId ? '更新する' : '登録する'}
            </button>
            {editingId && (
              <button type="button" className="secondary-button" onClick={handleCancelEdit}>
                編集をやめる
              </button>
            )}
          </div>
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
                <th>取引先名</th>
                <th>日付</th>
                <th>支払日付</th>
                <th>入金予定日</th>
                <th>状態</th>
                <th>区分</th>
                <th>金額</th>
                <th>メモ</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.customer_name || '-'}</td>
                    <td>{entry.occurred_on}</td>
                    <td>{entry.payment_date || '-'}</td>
                    <td>{entry.deposit_due_on || '-'}</td>
                    <td>
                      <select
                        className={`status-select ${
                          entry.type === 'sales'
                            ? entry.deposit_completed
                              ? 'is-complete'
                              : ''
                            : entry.payment_completed
                              ? 'is-complete'
                              : ''
                        }`}
                        value={
                          entry.type === 'sales'
                            ? entry.deposit_completed
                              ? 'completed'
                              : 'pending'
                            : entry.payment_completed
                              ? 'completed'
                              : 'pending'
                        }
                        onChange={(event) => handleSettlementChange(entry, event.target.value)}
                      >
                        {entry.type === 'sales' ? (
                          <>
                            <option value="pending">未入金</option>
                            <option value="completed">入金済み</option>
                          </>
                        ) : (
                          <>
                            <option value="pending">未払い</option>
                            <option value="completed">支払済み</option>
                          </>
                        )}
                      </select>
                    </td>
                    <td>
                      <span className={`pill ${entry.type}`}>
                        {entry.type === 'sales' ? '売上' : '原価'}
                      </span>
                    </td>
                    <td>{currencyFormatter.format(entry.amount)}</td>
                    <td>{entry.note || '-'}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => handleEditEntry(entry)}
                        >
                          編集
                        </button>
                        <button
                          type="button"
                          className="secondary-button compact-button danger-button"
                          onClick={() => handleDeleteEntry(entry.id)}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="empty-cell">
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
