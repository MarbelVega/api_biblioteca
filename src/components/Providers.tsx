'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/client/auth';
import { ToastProvider } from './ui';

export default function Providers({ children }: { children: ReactNode }) {
  return <ToastProvider><AuthProvider>{children}</AuthProvider></ToastProvider>;
}
