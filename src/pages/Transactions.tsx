import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { useState } from "react";
import SimulateTransactionModal from "../components/SimulateTransactionModal";
import { api } from "../lib/api";
import { formatPLN } from "../lib/money";

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

export default function Transactions() {
  const [modalOpen, setModalOpen] = useState(false);
  const { accountId } = useParams<{ accountId: string }>();
  const [params, setParams] = useSearchParams();

  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = useMemo(() => {
    const n = Number(params.get("limit") ?? 20);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : 20;
  }, [params]);

  const { data, isLoading, isFetching, isError, error, refetch } =
    useQuery<TxnList>({
      queryKey: ["transactions", accountId, { page, limit }],
      enabled: !!accountId,
      // v5: zamiast keepPreviousData: true
      placeholderData: keepPreviousData,
      queryFn: async () => {
        const res = await api.get<TxnList>(
          `/v1/accounts/${accountId}/transactions`,
          { params: { page, limit } }
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

  // ---- brak id w URL
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

  return (
    <section className="space-y-6">
      {header}

      {/* pasek narzędzi */}
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
        <div className="text-sm text-muted">
          Razem: {total.toLocaleString("pl-PL")} transakcji
        </div>
      </div>

      {/* lista */}
      {items.length === 0 ? (
        <div className="card p-6 text-muted">
          Brak transakcji do wyświetlenia.
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {items.map((t: Txn) => {
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

      {/* paginacja */}
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
