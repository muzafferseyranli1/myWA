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
      <body className="bg-[#111B21] text-[#E9EDEF] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
