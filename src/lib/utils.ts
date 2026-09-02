import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function daysUntil(date: string | Date): number {
  const target = new Date(date);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'TODO': return 'bg-yellow-500/20 text-yellow-400';
    case 'IN_PROGRESS': return 'bg-blue-500/20 text-blue-400';
    case 'DONE': return 'bg-green-500/20 text-green-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'URGENT': return 'bg-red-500/20 text-red-400';
    case 'HIGH': return 'bg-orange-500/20 text-orange-400';
    case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-400';
    case 'LOW': return 'bg-green-500/20 text-green-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'TODO': return 'Yapılacak';
    case 'IN_PROGRESS': return 'Devam Ediyor';
    case 'DONE': return 'Tamamlandı';
    default: return status;
  }
}

export function getPriorityLabel(priority: string): string {
  switch (priority) {
    case 'URGENT': return 'Acil';
    case 'HIGH': return 'Yüksek';
    case 'MEDIUM': return 'Orta';
    case 'LOW': return 'Düşük';
    default: return priority;
  }
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}
