// src/pages/Register.tsx
import { useState } from "react";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { extractApiMessages } from "../lib/errors";
import { useTitle } from "../lib/title";

const RegisterSchema = z.object({
  email: z.string().email({ message: "Podaj poprawny adres e-mail" }),
  password: z.string().min(8, { message: "Hasło musi mieć min. 8 znaków" }),
  fullName: z.string().min(3, { message: "Imię i nazwisko (min. 3 znaki)" }),
});
type RegisterInput = z.infer<typeof RegisterSchema>;

type RegisterResponse = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string; // ISO
};

export default function Register() {
  useTitle("Rejestracja");

  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterInput>({
    email: "",
    password: "",
    fullName: "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const mutation = useMutation<RegisterResponse, unknown, RegisterInput>({
    mutationFn: async (payload) => {
      const res = await api.post<RegisterResponse>(
        "/v1/auth/register",
        payload
      );
      return res.data;
    },
    onSuccess: () => {
      setSuccessMsg("Konto utworzone! Możesz się zalogować.");
      setTimeout(() => navigate("/login"), 700);
    },
    onError: (error) => setErrors(extractApiMessages(error)),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSuccessMsg(null);

    const parsed = RegisterSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    mutation.mutate(parsed.data);
  }

  return (
    <section className="mx-auto w-full max-w-md">
      <div className="card mt-10 sm:mt-16 p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Rejestracja</h2>

        {successMsg && (
          <div className="mt-4 rounded-md border border-success/40 bg-success/10 p-3 text-success">
            {successMsg}
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
            <label htmlFor="fullName" className="text-sm text-muted">
              Imię i nazwisko
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              value={form.fullName}
              onChange={handleChange}
              required
              className="input"
            />
          </div>

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
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              required
              className="input"
            />
            <p className="text-xs text-muted">Min. 8 znaków.</p>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary w-full"
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? "Tworzę konto…" : "Zarejestruj się"}
          </button>
        </form>
      </div>
    </section>
  );
}
