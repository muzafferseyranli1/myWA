import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MyWA — WhatsApp Görev Yönetim Platformu',
  openGraph: {
    title: 'MyWA — WhatsApp Görev Yönetim Platformu',
  },
};

export default function TaskPageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
