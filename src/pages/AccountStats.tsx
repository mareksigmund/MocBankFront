// src/pages/AccountStats.tsx
import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { api } from "../lib/api";
import { useTitle } from "../lib/title";
import { formatPLN } from "../lib/money";

type Account = {
  id: string;
  userId: string;
  name: string;
  iban: string;
  currency: "PLN";
  balance: number; // grosze
  createdAt: string;
  updatedAt: string;
};

type Txn = {
  id: string;
  accountId: string;
  amount: number; // grosze (− wydatek, + przychód)
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

type MonthAgg = {
  ym: string; // "2025-03"
  monthLabel: string; // "mar 2025"
  income: number; // grosze
  expense: number; // grosze (wartość dodatnia)
  net: number; // grosze (income - expense)
};

// --- helpers ---
function toYm(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthLabelPL(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, 1);
  return dt.toLocaleDateString("pl-PL", { month: "short", year: "numeric" });
}
function clamp<T>(arr: T[], lastN: number): T[] {
  if (arr.length <= lastN) return arr;
  return arr.slice(arr.length - lastN);
}

export default function AccountStats() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  useTitle("Statystyki");

  // zakres: 3 / 6 / 12 m-cy
  const [range, setRange] = useState<3 | 6 | 12>(6);
  // typ wykresu
  const [view, setView] = useState<"stack" | "net">("stack");

  // Konto
  const accountQuery = useQuery({
    queryKey: ["account", accountId],
    enabled: !!accountId,
    queryFn: async () => {
      const res = await api.get<Account>(`/v1/accounts/${accountId}`);
      return res.data;
    },
  });

  // Transakcje (bierzemy sporo i agregujemy po stronie klienta)
  const txQuery = useQuery({
    queryKey: ["transactions", accountId, "all-for-stats"],
    enabled: !!accountId,
    queryFn: async () => {
      const res = await api.get<TxnList>(
        `/v1/accounts/${accountId}/transactions`,
        {
          params: { page: 1, limit: 1000 },
        }
      );
      return res.data.items;
    },
  });

  const aggs: MonthAgg[] = useMemo(() => {
    const txns = txQuery.data ?? [];
    if (txns.length === 0) return [];

    // zbuduj pełną oś miesięcy od pierwszej transakcji do dziś
    const dates = txns.map((t) => new Date(t.date));
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(); // do dziś

    const months: string[] = [];
    const it = new Date(min.getFullYear(), min.getMonth(), 1);
    const last = new Date(max.getFullYear(), max.getMonth(), 1);
    while (it <= last) {
      months.push(toYm(it));
      it.setMonth(it.getMonth() + 1);
    }

    // agregacje
    const byYm: Record<string, MonthAgg> = {};
    months.forEach((ym) => {
      byYm[ym] = {
        ym,
        monthLabel: monthLabelPL(ym),
        income: 0,
        expense: 0,
        net: 0,
      };
    });

    for (const t of txns) {
      const ym = toYm(new Date(t.date));
      const entry = byYm[ym] || {
        ym,
        monthLabel: monthLabelPL(ym),
        income: 0,
        expense: 0,
        net: 0,
      };
      if (t.amount >= 0) entry.income += t.amount;
      else entry.expense += Math.abs(t.amount);
      byYm[ym] = entry;
    }

    const list = months.map((ym) => {
      const e = byYm[ym];
      return { ...e, net: e.income - e.expense };
    });

    return list;
  }, [txQuery.data]);

  const aggsRange = useMemo(() => clamp(aggs, range), [aggs, range]);

  // KPI
  const kpi = useMemo(() => {
    const inc = aggsRange.reduce((s, m) => s + m.income, 0);
    const exp = aggsRange.reduce((s, m) => s + m.expense, 0);
    const net = inc - exp;
    const avgNet = aggsRange.length ? Math.round(net / aggsRange.length) : 0;

    return { inc, exp, net, avgNet };
  }, [aggsRange]);

  // Loading / Error
  if (accountQuery.isLoading || txQuery.isLoading) {
    return (
      <section className="space-y-6">
        <HeaderSkeleton onBack={() => navigate(-1)} />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-4 w-1/3 bg-overlay rounded mb-3" />
              <div className="h-7 w-1/2 bg-overlay rounded" />
            </div>
          ))}
        </div>
        <div className="card p-4 h-72 bg-overlay" />
      </section>
    );
  }

  if (accountQuery.isError || txQuery.isError) {
    let msg = "Nie udało się pobrać statystyk.";
    const err = (accountQuery.error ?? txQuery.error) as unknown;
    if (isAxiosError(err)) {
      const m = err.response?.data?.message;
      if (typeof m === "string") msg = m;
      if (Array.isArray(m) && m.length) msg = m.join("\n");
    }
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Statystyki
          </h2>
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-border px-4 py-2.5"
          >
            ← Wróć
          </button>
        </div>
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
          <p className="whitespace-pre-line">{msg}</p>
        </div>
      </section>
    );
  }

  const account = accountQuery.data!;

  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight">
            <span
              className="inline-block h-2 w-2 rounded-full bg-accent"
              aria-hidden
            />
            Statystyki — {account.name}
          </h2>
          <p className="text-sm text-muted mt-1">
            IBAN: <span className="font-mono">{account.iban}</span> • Saldo:{" "}
            <span className="font-semibold">{formatPLN(account.balance)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/accounts/${account.id}/transactions`}
            className="rounded-lg border border-border px-4 py-2.5"
          >
            Zobacz transakcje
          </Link>
          <button onClick={() => navigate(-1)} className="btn-primary">
            ← Wróć
          </button>
        </div>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <KpiCard label="Przychody" value={formatPLN(kpi.inc)} />
        <KpiCard label="Wydatki" value={formatPLN(-kpi.exp)} negative />
        <KpiCard
          label="Bilans (suma)"
          value={formatPLN(kpi.net)}
          tone={kpi.net >= 0 ? "pos" : "neg"}
        />
        <KpiCard
          label="Średni bilans / m-c"
          value={formatPLN(kpi.avgNet)}
          tone={kpi.avgNet >= 0 ? "pos" : "neg"}
        />
      </div>

      {/* Ustawienia wykresu */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1.5">
            <label className="text-sm text-muted">Zakres</label>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              {[3, 6, 12].map((n) => (
                <button
                  key={n}
                  className={`px-3 py-2 text-sm ${
                    range === n ? "bg-accent/20" : ""
                  }`}
                  onClick={() => setRange(n as 3 | 6 | 12)}
                >
                  {n} m-cy
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm text-muted">Widok</label>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                className={`px-3 py-2 text-sm ${
                  view === "stack" ? "bg-accent/20" : ""
                }`}
                onClick={() => setView("stack")}
              >
                Przychody/Wydatki
              </button>
              <button
                className={`px-3 py-2 text-sm ${
                  view === "net" ? "bg-accent/20" : ""
                }`}
                onClick={() => setView("net")}
              >
                Bilans (netto)
              </button>
            </div>
          </div>
        </div>

        {/* Wykres */}
        <div className="mt-4 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {view === "stack" ? (
              <BarChart data={aggsRange}>
                <CartesianGrid strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="monthLabel" />
                <YAxis tickFormatter={(v: number) => formatPLN(v)} width={80} />
                <Tooltip
                  formatter={(v: number | string /*, _name: string*/) =>
                    formatPLN(Number(v))
                  }
                  labelFormatter={(l: string) => `Miesiąc: ${l}`}
                />

                <Legend />
                {/* Uwaga: wydatki jako wartość dodatnia - pokazujemy czerwonym */}
                <Bar dataKey="income" name="Przychody" fill="#22c55e" />
                <Bar dataKey="expense" name="Wydatki" fill="#ef4444" />
              </BarChart>
            ) : (
              <LineChart data={aggsRange}>
                <CartesianGrid strokeOpacity={0.2} vertical={false} />
                <XAxis dataKey="monthLabel" />
                <YAxis tickFormatter={(v: number) => formatPLN(v)} width={80} />
                <Tooltip
                  formatter={(v: number | string) => formatPLN(Number(v))}
                  labelFormatter={(l: string) => `Miesiąc: ${l}`}
                />

                <Legend />
                <Line
                  type="monotone"
                  dataKey="net"
                  name="Bilans (netto)"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function HeaderSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div>
        <div className="h-6 w-48 bg-overlay rounded mb-2" />
        <div className="h-4 w-64 bg-overlay rounded" />
      </div>
      <div className="h-10 w-40 bg-overlay rounded" onClick={onBack} />
    </header>
  );
}

function KpiCard({
  label,
  value,
  negative,
  tone,
}: {
  label: string;
  value: string;
  negative?: boolean;
  tone?: "pos" | "neg";
}) {
  const toneClass =
    tone === "pos"
      ? "text-success"
      : tone === "neg"
      ? "text-danger"
      : negative
      ? "text-danger"
      : "";
  return (
    <div className="card p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
