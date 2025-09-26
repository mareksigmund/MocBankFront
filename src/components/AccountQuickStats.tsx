// src/components/AccountQuickStats.tsx
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "../lib/api";
import { formatPLN } from "../lib/money";

type Txn = {
  id: string;
  accountId: string;
  amount: number; // grosze
  currency: "PLN";
  date: string; // ISO
  description: string;
  counterparty?: string;
  categoryHint?: string;
  createdAt: string;
  updatedAt: string;
};

type TxnList = {
  items: Txn[];
  page: number;
  limit: number;
  total: number;
  pages: number;
};

type Props = { accountId: string };

// ---------- helpers ----------
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function toMonthInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fromMonthInput(s: string) {
  // s = YYYY-MM
  const [y, m] = s.split("-").map((n) => Number(n));
  return new Date(y, (m || 1) - 1, 1, 0, 0, 0, 0);
}
function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function monthEnd(d: Date) {
  // ostatni dzień miesiąca, 23:59:59.999
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

const PIE_COLORS = [
  "#ef4444",
  "#22c55e",
  "#eab308",
  "#06b6d4",
  "#a855f7",
  "#f97316",
  "#64748b",
] as const;

type RangeMode = "quick" | "custom";

export default function AccountQuickStats({ accountId }: Props) {
  // --- zakres czasu ---
  const [mode, setMode] = useState<RangeMode>("quick");
  const [days, setDays] = useState<30 | 90 | 180>(90);

  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => addMonths(new Date(), -3), []);

  const [fromMonth, setFromMonth] = useState<string>(toMonthInput(defaultFrom));
  const [toMonthVal, setToMonthVal] = useState<string>(toMonthInput(today));

  const { fromDate, toDate } = useMemo(() => {
    if (mode === "quick") {
      const to = new Date();
      const from = new Date();
      from.setDate(
        from.getDate() - (days === 30 ? 30 : days === 90 ? 90 : 180)
      );
      // pełne dni
      const fromD = new Date(
        from.getFullYear(),
        from.getMonth(),
        from.getDate(),
        0,
        0,
        0,
        0
      );
      const toD = new Date(
        to.getFullYear(),
        to.getMonth(),
        to.getDate(),
        23,
        59,
        59,
        999
      );
      return { fromDate: fromD, toDate: toD };
    }
    const f = monthStart(fromMonthInput(fromMonth));
    const t = monthEnd(fromMonthInput(toMonthVal));
    return { fromDate: f, toDate: t };
  }, [mode, days, fromMonth, toMonthVal]);

  // nawigacja miesiąc ↔ miesiąc (aktywny, gdy oglądamy pojedynczy miesiąc)
  const singleMonth = mode === "custom" && fromMonth === toMonthVal;
  function shiftMonth(delta: number) {
    if (!singleMonth) return;
    const base = fromMonthInput(fromMonth);
    const next = addMonths(base, delta);
    const s = toMonthInput(next);
    setFromMonth(s);
    setToMonthVal(s);
  }

  // --- fetch ---
  const q = useQuery<TxnList>({
    queryKey: [
      "accQuickStats",
      accountId,
      fromDate.toISOString(),
      toDate.toISOString(),
    ],
    queryFn: async () => {
      const res = await api.get<TxnList>(
        `/v1/accounts/${accountId}/transactions`,
        {
          params: {
            from: fromDate.toISOString(),
            to: toDate.toISOString(),
            page: 1,
            limit: 500,
          },
        }
      );
      return res.data;
    },
  });

  // --- agregacja miesięczna ---
  const monthAgg = useMemo(() => {
    const base: Record<
      string,
      { monthLabel: string; income: number; expense: number }
    > = {};
    for (const t of q.data?.items ?? []) {
      const d = new Date(t.date);
      const key = monthKey(d);
      if (!base[key]) {
        base[key] = {
          monthLabel: d.toLocaleString("pl-PL", {
            month: "short",
            year: "numeric",
          }),
          income: 0,
          expense: 0,
        };
      }
      if (t.amount > 0) base[key].income += t.amount;
      else base[key].expense += Math.abs(t.amount);
    }
    const rows = Object.entries(base)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => v);
    const totalInc = rows.reduce((s, r) => s + r.income, 0);
    const totalExp = rows.reduce((s, r) => s + r.expense, 0);
    return { rows, totalInc, totalExp };
  }, [q.data]);

  // --- wydatki wg kategorii (pie) ---
  const pieData = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of q.data?.items ?? []) {
      if (t.amount >= 0) continue;
      const cat = (t.categoryHint || "inne").toLowerCase();
      map.set(cat, (map.get(cat) || 0) + Math.abs(t.amount));
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const MAX = 6;
    const head = sorted.slice(0, MAX);
    const tailSum = sorted.slice(MAX).reduce((s, [, v]) => s + v, 0);
    const data = head.map(([name, value]) => ({ name, value }));
    if (tailSum > 0) data.push({ name: "inne", value: tailSum });
    return data;
  }, [q.data]);

  return (
    <div className="card p-4">
      {/* nagłówek i przełączniki zakresu */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-3">
        <div>
          <h3 className="text-lg font-semibold">Statystyki (miesięcznie)</h3>
          <p className="text-xs text-muted">
            Zakres: {fromDate.toLocaleDateString("pl-PL")} –{" "}
            {toDate.toLocaleDateString("pl-PL")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* tryb */}
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm ${
                mode === "quick" ? "bg-accent/20" : ""
              }`}
              onClick={() => setMode("quick")}
            >
              Ostatnie dni
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${
                mode === "custom" ? "bg-accent/20" : ""
              }`}
              onClick={() => setMode("custom")}
            >
              Własny zakres
            </button>
          </div>

          {/* Ostatnie dni */}
          {mode === "quick" && (
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              {[30, 90, 180].map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d as 30 | 90 | 180)}
                  className={`px-3 py-1.5 text-sm ${
                    days === d ? "bg-accent/20" : ""
                  }`}
                  aria-pressed={days === d}
                >
                  {d} dni
                </button>
              ))}
            </div>
          )}

          {/* Własny zakres: miesiąc od–do */}
          {mode === "custom" && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted">Od</label>
              <input
                type="month"
                className="input"
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
              />
              <label className="text-sm text-muted">Do</label>
              <input
                type="month"
                className="input"
                value={toMonthVal}
                onChange={(e) => setToMonthVal(e.target.value)}
              />

              {/* „miesiąc w lewo/prawo” gdy od==do */}
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                <button
                  className="px-2 py-1.5 text-sm"
                  title="Poprzedni miesiąc"
                  onClick={() => shiftMonth(-1)}
                  disabled={!singleMonth}
                >
                  ←
                </button>
                <button
                  className="px-2 py-1.5 text-sm"
                  title="Następny miesiąc"
                  onClick={() => shiftMonth(1)}
                  disabled={!singleMonth}
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* wykresy */}
      {q.isLoading ? (
        <div className="h-64 rounded bg-overlay" />
      ) : monthAgg.rows.length === 0 && pieData.length === 0 ? (
        <div className="text-muted">
          Brak danych do wyświetlenia w tym zakresie.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* kolumny: przychody / wydatki per miesiąc */}
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={monthAgg.rows}>
                <CartesianGrid strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="monthLabel" />
                <YAxis
                  tickFormatter={(value: number) => formatPLN(value)}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  formatter={(value: unknown) => formatPLN(Number(value))}
                  labelFormatter={(label: string) => `Miesiąc: ${label}`}
                />
                <Legend />
                <Bar dataKey="income" name="Przychody" fill="#22c55e" />
                <Bar dataKey="expense" name="Wydatki" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* kołowy: wydatki wg kategorii */}
          <div className="h-64 w-full">
            {pieData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted">
                Brak wydatków w tym okresie.
              </div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Tooltip
                    formatter={(value: unknown) => formatPLN(Number(value))}
                    labelFormatter={(label: string) => `Kategoria: ${label}`}
                  />
                  <Legend />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="80%"
                    stroke="none"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* podsumowania */}
      <div className="mt-3 grid sm:grid-cols-3 gap-2 text-sm">
        <div>
          Przychody:{" "}
          <span className="font-medium">{formatPLN(monthAgg.totalInc)}</span>
        </div>
        <div>
          Wydatki:{" "}
          <span className="font-medium">{formatPLN(-monthAgg.totalExp)}</span>
        </div>
        <div className="text-muted">
          Saldo:{" "}
          <span className="font-medium">
            {formatPLN(monthAgg.totalInc - monthAgg.totalExp)}
          </span>
        </div>
      </div>
    </div>
  );
}
