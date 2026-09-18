import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MyWA — WhatsApp Görev Yönetim Platformu',
  description: 'WhatsApp-integrated Task Management Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
