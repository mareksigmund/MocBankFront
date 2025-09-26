// src/pages/Home.tsx
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import { authStore } from "../lib/auth";
import { api } from "../lib/api";
import { formatPLN } from "../lib/money";
import { useTitle } from "../lib/title";
import SimulateTransactionModal from "../components/SimulateTransactionModal";

// ------- Typy -------
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
  amount: number; // grosze
  currency: "PLN";
  date: string; // ISO
  description: string;
  counterparty?: string;
  categoryHint?: string;
  externalTxnId?: string;
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

type ApiErrorBody = {
  message?: string | string[];
};

type RecentTxn = Txn & { accountName: string };

type ChartPoint = { dayLabel: string; net: number };

export default function Home() {
  useTitle("Pulpit");

  const token = localStorage.getItem("mb_access");
  const isLoggedIn = !!token;
  const qc = useQueryClient();

  const greetingName = useMemo(() => {
    const full = authStore.user?.fullName?.trim();
    const email = authStore.user?.email?.trim();
    const base = full && full.length > 0 ? full : email || "Użytkowniku";
    const first = base.split(/\s+/)[0];
    return first || "Użytkowniku";
  }, []);

  // 1) Konta
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<
    Account[]
  >({
    queryKey: ["accounts"],
    enabled: isLoggedIn,
    queryFn: async () => {
      const res = await api.get<Account[]>("/v1/accounts");
      return res.data;
    },
  });

  // stabilna referencja tablicy
  const accounts = useMemo(() => data ?? [], [data]);

  // suma sald
  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balance, 0),
    [accounts]
  );

  // 2) „Szybkie dodanie transakcji”
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // inicjalizacja selectedId gdy pojawią się konta
  useEffect(() => {
    if (!selectedId && accounts.length) setSelectedId(accounts[0].id);
  }, [accounts, selectedId]);

  const selectedAcc = useMemo(
    () => accounts.find((a) => a.id === selectedId),
    [accounts, selectedId]
  );

  // 3) Ostatnie transakcje – dla WYBRANEGO konta
  const recentQuery = useQuery<RecentTxn[]>({
    queryKey: ["recentTxns", selectedId],
    enabled: isLoggedIn && !!selectedId,
    queryFn: async () => {
      const res = await api.get<TxnList>(
        `/v1/accounts/${selectedId}/transactions`,
        { params: { page: 1, limit: 5 } }
      );
      const accName = selectedAcc?.name ?? "";
      return res.data.items.map((t) => ({ ...t, accountName: accName }));
    },
    placeholderData: [],
  });

  // 4) Mini-wykres trendu (ostatnie 30 dni) – też dla WYBRANEGO konta
  const chartQuery = useQuery<ChartPoint[]>({
    queryKey: ["miniChart", selectedId],
    enabled: isLoggedIn && !!selectedId,
    queryFn: async () => {
      const res = await api.get<TxnList>(
        `/v1/accounts/${selectedId}/transactions`,
        { params: { page: 1, limit: 200 } } // bierzemy trochę historii i liczymy lokalnie
      );

      // Zliczamy sumę netto per dzień (lokalny czas)
      const byDay = new Map<string, number>();
      for (const t of res.data.items) {
        const d = new Date(t.date);
        const isoDay = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-");
        byDay.set(isoDay, (byDay.get(isoDay) || 0) + t.amount);
      }

      // Budujemy serię z ostatnich 30 dni (dziś włącznie)
      const out: ChartPoint[] = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const iso = [
          d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, "0"),
          String(d.getDate()).padStart(2, "0"),
        ].join("-");
        const label = d.toLocaleDateString("pl-PL", {
          day: "2-digit",
          month: "2-digit",
        });
        out.push({ dayLabel: label, net: byDay.get(iso) || 0 });
      }
      return out;
    },
    placeholderData: [],
  });

  function handleTxnAdded() {
    // auto-odświeżenie po udanej symulacji
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["recentTxns"] });
    qc.invalidateQueries({ queryKey: ["miniChart"] });
  }

  // ------- Widok dla niezalogowanych -------
  if (!isLoggedIn) {
    return (
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          MockBank UI
        </h2>
        <p className="text-muted">
          To jest strona startowa. Zaloguj się, aby skorzystać z aplikacji.
        </p>
        <div className="flex items-center gap-2">
          <Link to="/login" className="btn-primary">
            Zaloguj
          </Link>
          <Link
            to="/register"
            className="rounded-lg border border-border px-4 py-2.5"
          >
            Rejestracja
          </Link>
        </div>
      </section>
    );
  }

  // ------- Loading / Error -------
  if (isLoading) {
    return (
      <section className="space-y-6">
        <header className="flex items-center justify-between">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Pulpit
          </h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4">
              <div className="h-4 w-1/3 bg-overlay rounded mb-3" />
              <div className="h-7 w-1/2 bg-overlay rounded" />
            </div>
          ))}
        </div>

        <div className="card p-4">
          <div className="h-5 w-1/4 bg-overlay rounded mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 bg-overlay rounded" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (isError) {
    let msg = "Nie udało się pobrać kont.";
    if (isAxiosError(error)) {
      const m = (error.response?.data as ApiErrorBody | undefined)?.message;
      if (typeof m === "string") {
        msg = m;
      } else if (Array.isArray(m)) {
        msg =
          m.filter((t): t is string => typeof t === "string").join("\n") || msg;
      }
    }
    return (
      <section className="space-y-4">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Pulpit
        </h2>
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
          <p className="whitespace-pre-line">{msg}</p>
          <button onClick={() => refetch()} className="btn-primary mt-3">
            Spróbuj ponownie
          </button>
        </div>
      </section>
    );
  }

  // ------- Normalny widok -------
  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Witaj, {greetingName}
          </h2>
          <p className="text-sm text-muted mt-1">Pulpit</p>
          {isFetching && <p className="text-sm text-muted">Odświeżam…</p>}
        </div>
      </header>

      {/* Kafelki podsumowań */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-sm text-muted">Suma środków</div>
          <div className="text-2xl font-semibold">
            {formatPLN(totalBalance)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">Liczba kont</div>
          <div className="text-2xl font-semibold">{accounts.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">Waluty</div>
          <div className="text-2xl font-semibold">PLN</div>
          <div className="text-xs text-muted mt-1">
            Aktualnie dostępna tylko PLN.
          </div>
        </div>
      </div>

      {/* Belka akcji */}
      <div className="card p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(260px,420px)_auto_auto_auto] md:items-end">
          {/* Konto */}
          <div className="space-y-1.5">
            <label className="text-sm text-muted">Konto do transakcji</label>
            <select
              className="input w-full md:w-[28rem]"
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              aria-label="Wybierz konto do transakcji"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {formatPLN(a.balance)}
                </option>
              ))}
            </select>
          </div>

          {/* Dodaj transakcję */}
          <div className="flex md:justify-end">
            <button
              className="btn-primary w-full md:w-auto"
              disabled={!selectedId}
              onClick={() => setModalOpen(true)}
            >
              + Dodaj transakcję
            </button>
          </div>

          {/* Statystyki wybranego konta */}
          <div className="flex md:justify-end">
            <Link
              to={selectedId ? `/accounts/${selectedId}/stats` : "#"}
              className={`rounded-lg border border-border px-4 py-2.5 w-full md:w-auto text-center ${
                !selectedId ? "pointer-events-none opacity-60" : ""
              }`}
              aria-disabled={!selectedId ? true : undefined}
            >
              Statystyki
            </Link>
          </div>

          {/* Zarządzaj kontami */}
          <div className="flex md:justify-end md:ml-auto">
            <Link
              to="/accounts"
              className="rounded-lg border border-border px-4 py-2.5 w-full md:w-auto text-center"
            >
              Zarządzaj kontami
            </Link>
          </div>
        </div>
      </div>

      {/* Mini-wykres trendu 30 dni */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Trend (30 dni)</h3>
            {selectedAcc && (
              <span className="text-xs rounded-full border border-border px-2 py-0.5 text-muted">
                {selectedAcc.name}
              </span>
            )}
          </div>
          <span className="text-xs text-muted">
            Zielone = saldo na plus, czerwone = minus (dzień)
          </span>
        </div>

        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartQuery.data ?? []}>
              <CartesianGrid strokeOpacity={0.15} vertical={false} />
              <XAxis
                dataKey="dayLabel"
                interval="preserveStartEnd"
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tickFormatter={(v: number) => formatPLN(v)}
                width={70}
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(v: number | string) => formatPLN(Number(v))}
                labelFormatter={(l: string) => `Dzień: ${l}`}
              />
              {/* Jedna seria netto – kolor dynamiczny punktów nie jest trywialny,
                  ale Area ze stroke'em akcentowym sprawdza się jako „iskra”. */}
              <Area
                type="monotone"
                dataKey="net"
                name="Netto (dzień)"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ostatnie transakcje (dla wybranego konta) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Ostatnie transakcje</h3>
          {selectedAcc && (
            <span className="text-xs rounded-full border border-border px-2 py-0.5 text-muted">
              {selectedAcc.name}
            </span>
          )}
        </div>

        {recentQuery.isLoading ? (
          <div className="card p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-overlay rounded mb-2" />
            ))}
          </div>
        ) : recentQuery.data && recentQuery.data.length > 0 ? (
          <div className="card divide-y divide-border">
            {recentQuery.data.map((t) => {
              const positive = t.amount > 0;
              return (
                <div
                  key={t.id}
                  className="flex flex-col sm:flex-row gap-2 sm:gap-4 p-3 sm:items-center"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {t.description || "—"}
                      </span>
                      <span className="text-xs rounded-full border border-border px-2 py-0.5 text-muted">
                        {t.accountName}
                      </span>
                      {t.categoryHint && (
                        <span className="text-xs rounded-full border border-border px-2 py-0.5 text-muted">
                          {t.categoryHint}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {t.counterparty && (
                        <span>Kontrahent: {t.counterparty} • </span>
                      )}
                      <span>
                        {new Date(t.date).toLocaleString("pl-PL", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`text-right font-semibold ${
                      positive ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatPLN(t.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-6 text-muted">
            Brak transakcji do wyświetlenia.
          </div>
        )}
      </div>

      {/* Modal do dodania transakcji */}
      {modalOpen && selectedId && (
        <SimulateTransactionModal
          accountId={selectedId}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={handleTxnAdded}
        />
      )}
    </section>
  );
}
