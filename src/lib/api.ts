import axios from "axios";
import { authStore } from "./auth";

const baseURL = import.meta.env.VITE_API_URL;
if (!baseURL) {
  // Pomoże szybko wykryć brak .env podczas dev
  console.warn("VITE_API_URL nie jest ustawione w .env");
}

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000, // 10s
});

// Do każdej prośby dorzucamy Authorization (jeśli zalogowany)
api.interceptors.request.use((config) => {
  const t = authStore.token;
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// Globalna obsługa 401/429
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      // token nieważny / brak uprawnień → wyloguj i przenieś na /login
      authStore.logout();
      const from = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      if (!window.location.pathname.startsWith("/login")) {
        window.location.assign(`/login?reason=expired&from=${from}`);
      }
    }
    if (status === 429) {
      console.warn("Przekroczony limit zapytań (429). Spróbuj za chwilę.");
    }
    return Promise.reject(err);
  }
);
