// src/pages/Login.tsx
import { useState } from "react";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { authStore, type LoginResponse } from "../lib/auth";
import { extractApiMessages } from "../lib/errors";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTitle } from "../lib/title";

const LoginSchema = z.object({
  email: z.string().email({ message: "Podaj poprawny adres e-mail" }),
  password: z.string().min(1, { message: "Podaj hasło" }),
});
type LoginInput = z.infer<typeof LoginSchema>;

export default function Login() {
  useTitle("Logowanie");

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromParam = params.get("from") || "/";
  const safeFrom = fromParam.startsWith("/") ? fromParam : "/";

  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(
    params.get("reason") === "expired"
      ? "Sesja wygasła. Zaloguj się ponownie."
      : null
  );

  const mutation = useMutation<LoginResponse, unknown, LoginInput>({
    mutationFn: async (payload) => {
      const res = await api.post<LoginResponse>("/v1/auth/login", payload);
      return res.data;
    },
    onSuccess: (data) => {
      authStore.saveSession(data);
      navigate(safeFrom, { replace: true });
    },
    onError: (error) => setErrors(extractApiMessages(error)),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setInfo(null);
    const parsed = LoginSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <div className="card mt-10 sm:mt-16 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Logowanie</h2>

        {info && (
          <div className="mt-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
            {info}
          </div>
        )}

        {errors.length > 0 && (
          <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-danger">
            <ul className="list-disc ms-5 space-y-1">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm text-muted">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              className="input"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm text-muted">
              Hasło
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              required
              className="input"
            />
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary w-full"
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? "Loguję…" : "Zaloguj się"}
          </button>
        </form>
      </div>
    </section>
  );
}
