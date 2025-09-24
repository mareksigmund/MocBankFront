import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";

import { api } from "../lib/api";
import { formatPLN } from "../lib/money";
import SimulateTransactionModal from "../components/SimulateTransactionModal";
import { useTitle } from "../lib/title";

// ---- Typy ----
type Txn = {
  id: string;
  accountId: string;
  amount: number; // grosze (minus = wydatek, plus = wpływ)
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

type ApiErrorBody = { message?: string | string[] };

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

// ---- Pomocnicze daty ----
function todayYMD(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function startOfDayISOLocal(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toISOString();
}
function endOfDayISOLocal(ymd: string): string {
  return new Date(`${ymd}T23:59:59.999`).toISOString();
}
function isValidYMD(v?: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function last7Days(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { from: ymd(from), to: ymd(to) };
}
function thisMonth(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return { from: ymd(start), to: ymd(end) };
}

// ---- CSV helper (eksport bieżącej strony) ----
function downloadCsvCurrentPage(accountId: string, items: Txn[]) {
  // średnik jako separator jest przyjazny dla PL Excela
  const header = [
    "id",
    "accountId",
    "date_iso",
    "description",
    "counterparty",
    "category",
    "amount_minor",
    "amount_pln",
    "currency",
  ];
  const rows = items.map((t) => [
    t.id,
    t.accountId,
    t.date,
    (t.description ?? "").replaceAll(";", ","),
    (t.counterparty ?? "").replaceAll(";", ","),
    (t.categoryHint ?? "").replaceAll(";", ","),
    String(t.amount),
    (t.amount / 100).toFixed(2), // kropka jako separ. dziesiętny
    t.currency,
  ]);

  const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  a.href = url;
  a.download = `transactions_${accountId}_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export default function Transactions() {
  useTitle("Transakcje");

  const { accountId } = useParams<{ accountId: string }>();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = useMemo(() => {
    const n = Number(params.get("limit") ?? 20);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 20;
  }, [params]);

  // stan modala
  const [modalOpen, setModalOpen] = useState(false);

  // stan filtrów (kontrolowane inputy)
  const [from, setFrom] = useState<string>(params.get("from") ?? "");
  const [to, setTo] = useState<string>(params.get("to") ?? "");
  useEffect(() => {
    setFrom(params.get("from") ?? "");
    setTo(params.get("to") ?? "");
  }, [params]);

  const fromISO = isValidYMD(params.get("from"))
    ? startOfDayISOLocal(params.get("from")!)
    : undefined;
  const toISO = isValidYMD(params.get("to"))
    ? endOfDayISOLocal(params.get("to")!)
    : undefined;

  const { data, isLoading, isFetching, isError, error, refetch } =
    useQuery<TxnList>({
      queryKey: [
        "transactions",
        accountId,
        { page, limit, from: fromISO, to: toISO },
      ],
      enabled: !!accountId,
      placeholderData: keepPreviousData,
      queryFn: async () => {
        const res = await api.get<TxnList>(
          `/v1/accounts/${accountId}/transactions`,
          {
            params: {
              page,
              limit,
              ...(fromISO ? { from: fromISO } : {}),
              ...(toISO ? { to: toISO } : {}),
            },
          }
        );
        return res.data;
      },
    });

  function setPage(p: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next, { replace: true });
  }
  function setLimit(l: number) {
    const next = new URLSearchParams(params);
    next.set("limit", String(l));
    next.set("page", "1");
    setParams(next, { replace: true });
  }
  function applyFilters() {
    const next = new URLSearchParams(params);
    if (isValidYMD(from)) next.set("from", from!);
    else next.delete("from");
    if (isValidYMD(to)) next.set("to", to!);
    else next.delete("to");
    next.set("page", "1");
    setParams(next, { replace: true });
  }
  function clearFilters() {
    const next = new URLSearchParams(params);
    next.delete("from");
    next.delete("to");
    next.set("page", "1");
    setParams(next, { replace: true });
  }
  function quickToday() {
    const d = todayYMD();
    const next = new URLSearchParams(params);
    next.set("from", d);
    next.set("to", d);
    next.set("page", "1");
    setParams(next, { replace: true });
  }
  function quickLast7() {
    const r = last7Days();
    const next = new URLSearchParams(params);
    next.set("from", r.from);
    next.set("to", r.to);
    next.set("page", "1");
    setParams(next, { replace: true });
  }
  function quickThisMonth() {
    const r = thisMonth();
    const next = new URLSearchParams(params);
    next.set("from", r.from);
    next.set("to", r.to);
    next.set("page", "1");
    setParams(next, { replace: true });
  }

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-2xl md:text-3xl font-semibold tracking-tight">
          <span
            className="inline-block h-2 w-2 rounded-full bg-accent"
            aria-hidden
          />
          Transakcje
        </h2>
        <p className="text-sm text-muted mt-1">
          Konto: <span className="font-mono">{accountId}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        {isFetching && <span className="text-sm text-muted">Odświeżam…</span>}
        <button className="btn-primary" onClick={() => setModalOpen(true)}>
          + Dodaj transakcję
        </button>
        <Link
          to="/accounts"
          className="rounded-lg border border-border px-4 py-2.5"
        >
          ← Wróć do kont
        </Link>
      </div>
    </div>
  );

  // ---- brak id
  if (!accountId) {
    return (
      <section className="space-y-6">
        {header}
        <div className="card p-4 text-danger">
          Brak identyfikatora konta w adresie.
        </div>
      </section>
    );
  }

  // ---- loading
  if (isLoading) {
    return (
      <section className="space-y-6">
        {header}

        {/* Filtry (disabled) */}
        <div className="card p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto,auto,auto] items-end">
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Od</label>
              <input className="input" type="date" disabled />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Do</label>
              <input className="input" type="date" disabled />
            </div>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              disabled
            >
              Wyczyść
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              disabled
            >
              Dziś
            </button>
            <button className="btn-primary" disabled aria-busy>
              Zastosuj
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="h-5 w-1/3 rounded bg-overlay mb-3" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 w-full rounded bg-overlay mb-2" />
          ))}
        </div>
      </section>
    );
  }

  // ---- error
  if (isError) {
    let msg = "Nie udało się pobrać transakcji.";
    let status: number | undefined;

    if (isAxiosError(error)) {
      status = error.response?.status;
      const m = (error.response?.data as ApiErrorBody | undefined)?.message;
      if (Array.isArray(m)) {
        const texts = m.filter(isNonEmptyString);
        if (texts.length) msg = texts.join("\n");
      } else if (isNonEmptyString(m)) {
        msg = m;
      }
    }

    return (
      <section className="space-y-6">
        {header}

        {/* Filtry nadal dostępne przy błędzie */}
        <div className="card p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto,auto,auto] items-end">
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Od</label>
              <input
                className="input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm text-muted">Do</label>
              <input
                className="input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              onClick={clearFilters}
            >
              Wyczyść
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              onClick={quickToday}
            >
              Dziś
            </button>
            <button className="btn-primary" onClick={applyFilters}>
              Zastosuj
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-danger">
          <p className="whitespace-pre-line">{msg}</p>
          {status === 403 && (
            <p className="text-sm mt-1">Nie masz dostępu do tego konta.</p>
          )}
          {status === 429 && (
            <p className="text-sm mt-1">
              Limit zapytań przekroczony. Spróbuj za chwilę.
            </p>
          )}
          <button onClick={() => refetch()} className="btn-primary mt-3">
            Spróbuj ponownie
          </button>
        </div>
      </section>
    );
  }

  // ---- data
  const items: Txn[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, data?.pages ?? 1);

  // Podsumowania dla BIEŻĄCEJ STRONY
  const sums = items.reduce(
    (acc, t) => {
      if (t.amount > 0) acc.in += t.amount;
      else acc.out += t.amount; // out jest ujemny
      return acc;
    },
    { in: 0, out: 0 }
  );
  const net = sums.in + sums.out;

  return (
    <section className="space-y-6">
      {header}

      {/* Filtry dat */}
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr,1fr,auto,auto,auto] items-end">
          <div className="space-y-1.5">
            <label className="text-sm text-muted">Od</label>
            <input
              className="input"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm text-muted">Do</label>
            <input
              className="input"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button
            className="rounded-lg border border-border px-4 py-2.5"
            onClick={clearFilters}
          >
            Wyczyść
          </button>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              onClick={quickToday}
            >
              Dziś
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              onClick={quickLast7}
            >
              7 dni
            </button>
            <button
              className="rounded-lg border border-border px-4 py-2.5"
              onClick={quickThisMonth}
            >
              Ten miesiąc
            </button>
          </div>
          <button className="btn-primary" onClick={applyFilters}>
            Zastosuj
          </button>
        </div>
      </div>

      {/* Pasek narzędzi: limit, eksport, info */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="limit" className="text-sm text-muted">
            Na stronę
          </label>
          <select
            id="limit"
            className="input w-28"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <button
          className="rounded-lg border border-border px-4 py-2.5"
          onClick={() => accountId && downloadCsvCurrentPage(accountId, items)}
          disabled={items.length === 0}
          title="Eksportuj tylko bieżącą stronę wyników"
        >
          Eksport CSV (ta strona)
        </button>

        <div className="text-sm text-muted">
          Razem: {total.toLocaleString("pl-PL")} transakcji
        </div>
      </div>

      {/* Podsumowania (bieżąca strona) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-sm text-muted">Wpływy (strona)</div>
          <div className="text-2xl font-semibold text-success">
            {formatPLN(sums.in)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">Wydatki (strona)</div>
          <div className="text-2xl font-semibold text-danger">
            {formatPLN(sums.out)}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-muted">Bilans (strona)</div>
          <div
            className={`text-2xl font-semibold ${
              net >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatPLN(net)}
          </div>
        </div>
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <div className="card p-6 text-muted">
          Brak transakcji do wyświetlenia.
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {items.map((t) => {
            const positive = t.amount > 0;
            return (
              <div
                key={t.id}
                className="flex flex-col sm:flex-row gap-2 sm:gap-4 p-3 sm:items-center"
              >
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.description || "—"}</span>
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
      )}

      {/* Paginacja */}
      <div className="flex items-center justify-between">
        <button
          className="rounded-lg border border-border px-4 py-2.5 disabled:opacity-50"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          aria-label="Poprzednia strona"
        >
          ← Poprzednia
        </button>

        <div className="text-sm text-muted">
          Strona <span className="font-medium text-foreground">{page}</span> z{" "}
          <span className="font-medium text-foreground">{pages}</span>
        </div>

        <button
          className="rounded-lg border border-border px-4 py-2.5 disabled:opacity-50"
          onClick={() => setPage(page + 1)}
          disabled={page >= pages}
          aria-label="Następna strona"
        >
          Następna →
        </button>
      </div>

      {/* Modal symulacji */}
      {accountId && (
        <SimulateTransactionModal
          accountId={accountId}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
