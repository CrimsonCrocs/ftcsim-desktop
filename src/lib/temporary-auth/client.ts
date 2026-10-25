"use client";

import { createAuthClient } from "better-auth/react";

export const temporaryAuthClient = createAuthClient({
  sessionOptions: {
    refetchInterval: 60,
    refetchOnWindowFocus: true,
    refetchWhenOffline: false,
  },
});
