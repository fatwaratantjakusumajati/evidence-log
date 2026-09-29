import { QueryClient, QueryCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { toast } from "sonner";

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (!query.meta?.showErrorToast) return;
        const label = typeof query.meta?.errorLabel === "string" ? query.meta.errorLabel : "Data";
        toast.error(`Gagal memuat ${label.toLowerCase()}`, {
          description:
            error instanceof Error && error.message
              ? error.message
              : "Periksa koneksi internet anda, lalu coba lagi.",
        });
      },
    }),
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30 * 1000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
