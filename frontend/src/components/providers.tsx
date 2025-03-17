// frontend/src/components/providers.tsx (更新版)
"use client";

import { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { UsageLimitProvider } from "@/contexts/UsageLimitContext";

// Create a client
const queryClient = new QueryClient();

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UsageLimitProvider>
          {children}
          <Toaster />
        </UsageLimitProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
