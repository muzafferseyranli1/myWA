import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (e) {
    return '';
  }
}

export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const fDate = formatDate(date);
  const fTime = formatTime(date);
  return fDate && fTime ? `${fDate} ${fTime}` : fDate || fTime;
}

export function daysUntil(date: string | Date | null | undefined): number {
  if (!date) return 0;
  try {
    const target = new Date(date);
    if (isNaN(target.getTime())) return 0;
    const now = new Date();
    target.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch (e) {
    return 0;
  }
}

export function getStatusColor(status: string | null | undefined): string {
  switch (status) {
    case 'TODO': return 'bg-yellow-500/20 text-yellow-400';
    case 'IN_PROGRESS': return 'bg-blue-500/20 text-blue-400';
    case 'DONE': return 'bg-green-500/20 text-green-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export function getPriorityColor(priority: string | null | undefined): string {
  switch (priority) {
    case 'URGENT': return 'bg-red-500/20 text-red-400';
    case 'HIGH': return 'bg-orange-500/20 text-orange-400';
    case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-400';
    case 'LOW': return 'bg-green-500/20 text-green-400';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}

export function getStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'TODO': return 'Yapılacak';
    case 'IN_PROGRESS': return 'Devam Ediyor';
    case 'DONE': return 'Tamamlandı';
    default: return status || '';
  }
}

export function getPriorityLabel(priority: string | null | undefined): string {
  switch (priority) {
    case 'URGENT': return 'Acil';
    case 'HIGH': return 'Yüksek';
    case 'MEDIUM': return 'Orta';
    case 'LOW': return 'Düşük';
    default: return priority || '';
  }
}

export function truncate(str: string | null | undefined, length: number): string {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return 'WA';
  try {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  } catch (e) {
    return 'WA';
  }
}
