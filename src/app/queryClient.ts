import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // nie odświeża za każdym razem po powrocie do karty
      retry: 1, // 1 próba ponowienia przy błędzie
    },
    mutations: {
      retry: 0,
    },
  },
});
