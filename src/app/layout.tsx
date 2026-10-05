import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NLAMS — National Land Acquisition Management System',
  description: 'National Land Acquisition Management System - Phase 1 Foundation',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
