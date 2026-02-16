import { HSKLevel } from '../types';

export const getLevelTheme = (level: HSKLevel) => {
  switch (level) {
    case HSKLevel.HSK1: // Entry - Emerald Green
      return {
        bg: 'bg-emerald-50',
        bgSoft: 'bg-emerald-100',
        text: 'text-emerald-700',
        textLight: 'text-emerald-600',
        border: 'border-emerald-200',
        ring: 'focus:ring-emerald-500',
        badge: 'bg-emerald-100 text-emerald-800',
        icon: 'text-emerald-500'
      };
    case HSKLevel.HSK2: // Basic - Sky Blue
      return {
        bg: 'bg-sky-50',
        bgSoft: 'bg-sky-100',
        text: 'text-sky-700',
        textLight: 'text-sky-600',
        border: 'border-sky-200',
        ring: 'focus:ring-sky-500',
        badge: 'bg-sky-100 text-sky-800',
        icon: 'text-sky-500'
      };
    case HSKLevel.HSK3: // Intermediate - Amber/Orange
      return {
        bg: 'bg-amber-50',
        bgSoft: 'bg-amber-100',
        text: 'text-amber-700',
        textLight: 'text-amber-600',
        border: 'border-amber-200',
        ring: 'focus:ring-amber-500',
        badge: 'bg-amber-100 text-amber-800',
        icon: 'text-amber-500'
      };
    case HSKLevel.HSK4: // Advanced - Rose Red
      return {
        bg: 'bg-rose-50',
        bgSoft: 'bg-rose-100',
        text: 'text-rose-700',
        textLight: 'text-rose-600',
        border: 'border-rose-200',
        ring: 'focus:ring-rose-500',
        badge: 'bg-rose-100 text-rose-800',
        icon: 'text-rose-500'
      };
    default:
      return {
        bg: 'bg-gray-50',
        bgSoft: 'bg-gray-100',
        text: 'text-gray-700',
        textLight: 'text-gray-600',
        border: 'border-gray-200',
        ring: 'focus:ring-gray-500',
        badge: 'bg-gray-100 text-gray-800',
        icon: 'text-gray-500'
      };
  }
};