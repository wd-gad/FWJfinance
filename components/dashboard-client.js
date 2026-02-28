'use client';

import { useEffect, useMemo, useState } from 'react';
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

const amountRangeOptions = [
  { value: 'all', label: 'すべて', min: 0, max: Number.POSITIVE_INFINITY },
  { value: 'under-100k', label: '10万円未満', min: 0, max: 99999 },
  { value: '100k-300k', label: '10万円以上 30万円未満', min: 100000, max: 299999 },
  { value: '300k-500k', label: '30万円以上 50万円未満', min: 300000, max: 499999 },
  { value: '500k-plus', label: '50万円以上', min: 500000, max: Number.POSITIVE_INFINITY }
];

const periodGroupOptions = [
  { value: 'month', label: '月ごと' },
  { value: 'week', label: '週ごと' },
  { value: 'day', label: '日ごと' }
];

const aggregationViewOptions = [
  { value: 'customer', label: '取引先ごと' },
  { value: 'period', label: '期間ごと' },
  { value: 'amount-range', label: '金額レンジごと' }
];

function getAmountRangeLabel(amount) {
  const matched = amountRangeOptions.find(
    (option) => option.value !== 'all' && amount >= option.min && amount <= option.max
  );
  return matched?.label || '未分類';
}

function getWeekStart(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function getPeriodLabel(dateText, grouping) {
  if (grouping === 'day') {
    return dateText;
  }
  if (grouping === 'week') {
    return `${getWeekStart(dateText)} 週`;
  }
  return dateText.slice(0, 7);
}

function summarizeEntries(items) {
  const totals = items.reduce(
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
}

function buildGroupedRows(items, getLabel) {
  const map = new Map();

  items.forEach((entry) => {
    const label = getLabel(entry);
    const current = map.get(label) ?? { label, count: 0, sales: 0, cost: 0 };
    current.count += 1;
    if (entry.type === 'sales') {
      current.sales += entry.amount;
    } else {
      current.cost += entry.amount;
    }
    map.set(label, current);
  });

  return [...map.values()]
    .map((row) => ({
      ...row,
      profit: row.sales - row.cost
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'ja'));
}

export default function DashboardClient({ initialEntries, initialError }) {
  const [entries, setEntries] = useState(initialEntries);
  const [message, setMessage] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [filters, setFilters] = useState({
    start: '',
    end: '',
    customer: 'all',
    entryType: 'all',
    amountRange: 'all',
    periodGrouping: 'month',
    aggregationView: 'customer'
  });
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

  const customerOptions = useMemo(() => {
    return [...new Set(entries.map((entry) => entry.customer_name?.trim()).filter(Boolean))].sort(
      (left, right) => left.localeCompare(right, 'ja')
    );
  }, [entries]);

  const currentEditingEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId) ?? null,
    [editingId, entries]
  );

  const isSales = form.type === 'sales';
  const isCost = form.type === 'cost';

  const filteredEntries = useMemo(() => {
    const range = amountRangeOptions.find((option) => option.value === filters.amountRange);

    return entries.filter((entry) => {
      if (filters.start && entry.occurred_on < filters.start) {
        return false;
      }
      if (filters.end && entry.occurred_on > filters.end) {
        return false;
      }
      if (filters.customer !== 'all' && entry.customer_name !== filters.customer) {
        return false;
      }
      if (filters.entryType !== 'all' && entry.type !== filters.entryType) {
        return false;
      }
      if (range && filters.amountRange !== 'all') {
        if (entry.amount < range.min || entry.amount > range.max) {
          return false;
        }
      }
      return true;
    });
  }, [entries, filters]);

  const summary = useMemo(() => summarizeEntries(filteredEntries), [filteredEntries]);
  const customerRows = useMemo(
    () => buildGroupedRows(filteredEntries, (entry) => entry.customer_name || '取引先未設定'),
    [filteredEntries]
  );
  const periodRows = useMemo(
    () => buildGroupedRows(filteredEntries, (entry) => getPeriodLabel(entry.occurred_on, filters.periodGrouping)),
    [filteredEntries, filters.periodGrouping]
  );
  const amountRangeRows = useMemo(
    () => buildGroupedRows(filteredEntries, (entry) => getAmountRangeLabel(entry.amount)),
    [filteredEntries]
  );
  const activeAggregation = useMemo(() => {
    if (filters.aggregationView === 'period') {
      return {
        title: '期間ごと',
        labelTitle:
          filters.periodGrouping === 'month'
            ? '月'
            : filters.periodGrouping === 'week'
              ? '週'
              : '日付',
        rows: periodRows
      };
    }

    if (filters.aggregationView === 'amount-range') {
      return {
        title: '金額レンジごと',
        labelTitle: '金額レンジ',
        rows: amountRangeRows
      };
    }

    return {
      title: '取引先ごと',
      labelTitle: '取引先名',
      rows: customerRows
    };
  }, [amountRangeRows, customerRows, filters.aggregationView, filters.periodGrouping, periodRows]);

  function resetForm() {
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
  }

  function handleFilterSubmit(event) {
    event.preventDefault();

    if (filters.start && filters.end && filters.start > filters.end) {
      setMessage('終了日は開始日以降を指定してください。');
      return;
    }

    setMessage('');
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

    const result = editingId
      ? await supabase
          .from('entries')
          .update(payload)
          .eq('id', editingId)
          .select(
            'id, customer_name, occurred_on, payment_date, deposit_due_on, payment_completed, deposit_completed, type, amount, note, created_at'
          )
          .single()
      : await supabase
          .from('entries')
          .insert(payload)
          .select(
            'id, customer_name, occurred_on, payment_date, deposit_due_on, payment_completed, deposit_completed, type, amount, note, created_at'
          )
          .single();

    if (result.error) {
      setMessage(result.error.message);
      setSubmitting(false);
      return;
    }

    setEntries((currentEntries) => {
      if (editingId) {
        return currentEntries.map((entry) => (entry.id === editingId ? result.data : entry));
      }
      return [result.data, ...currentEntries];
    });

    resetForm();
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
    setMessage('');
    resetForm();
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

  function renderGroupedTable(rows, labelTitle) {
    return (
      <div className="table-wrap summary-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{labelTitle}</th>
              <th>件数</th>
              <th>売上</th>
              <th>原価</th>
              <th>粗利</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.count}</td>
                  <td>{currencyFormatter.format(row.sales)}</td>
                  <td>{currencyFormatter.format(row.cost)}</td>
                  <td>{currencyFormatter.format(row.profit)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="empty-cell">
                  条件に一致するデータがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? (editingId ? '更新中...' : '登録中...') : editingId ? '更新する' : '登録する'}
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
          <p className="eyebrow">Aggregation</p>
          <h2>条件を組み合わせて集計</h2>
        </div>

        <form className="form-grid compact-grid" onSubmit={handleFilterSubmit}>
          <label>
            開始日
            <input
              type="date"
              value={filters.start}
              onChange={(event) => setFilters({ ...filters, start: event.target.value })}
            />
          </label>
          <label>
            終了日
            <input
              type="date"
              value={filters.end}
              onChange={(event) => setFilters({ ...filters, end: event.target.value })}
            />
          </label>
          <label>
            取引先名
            <select
              value={filters.customer}
              onChange={(event) => setFilters({ ...filters, customer: event.target.value })}
            >
              <option value="all">すべて</option>
              {customerOptions.map((customerName) => (
                <option key={customerName} value={customerName}>
                  {customerName}
                </option>
              ))}
            </select>
          </label>
          <label>
            区分
            <select
              value={filters.entryType}
              onChange={(event) => setFilters({ ...filters, entryType: event.target.value })}
            >
              <option value="all">売上・原価すべて</option>
              <option value="sales">売上のみ</option>
              <option value="cost">原価のみ</option>
            </select>
          </label>
          <label>
            金額レンジ
            <select
              value={filters.amountRange}
              onChange={(event) => setFilters({ ...filters, amountRange: event.target.value })}
            >
              {amountRangeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            期間集計単位
            <select
              value={filters.periodGrouping}
              onChange={(event) => setFilters({ ...filters, periodGrouping: event.target.value })}
            >
              {periodGroupOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="action-row">
            <button type="submit" className="primary-button">
              集計する
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setMessage('');
                setFilters({
                  start: '',
                  end: '',
                  customer: 'all',
                  entryType: 'all',
                  amountRange: 'all',
                  periodGrouping: 'month',
                  aggregationView: 'customer'
                });
              }}
            >
              条件をリセット
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
          <p className="eyebrow">Breakdown</p>
          <h2>集計キーを選んで結果を表示</h2>
        </div>

        {message && <p className="status-line error">{message}</p>}
        <p className="status-line">{filteredEntries.length} 件が現在の集計対象です。</p>
        <div className="aggregation-panel">
          <label className="aggregation-selector">
            集計キー
            <select
              value={filters.aggregationView}
              onChange={(event) =>
                setFilters({ ...filters, aggregationView: event.target.value })
              }
            >
              {aggregationViewOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <section className="breakdown-card single-breakdown-card">
            <h3>{activeAggregation.title}</h3>
            {renderGroupedTable(activeAggregation.rows, activeAggregation.labelTitle)}
          </section>
        </div>
      </section>

      <section className="section-card full-width">
        <div className="section-heading">
          <p className="eyebrow">Ledger</p>
          <h2>取引一覧</h2>
        </div>

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
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => (
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
                    条件に一致する取引がありません。
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
