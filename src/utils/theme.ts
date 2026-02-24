import { HSKLevel } from '../types';

export const getLevelTheme = (level: HSKLevel) => {
  switch (level) {
    case HSKLevel.HSK1:
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        badge: 'bg-green-100 text-green-800 border border-green-200',
        primary: 'bg-green-600 hover:bg-green-700',
        light: 'bg-green-50 text-green-700',
        ring: 'focus:ring-green-500'
      };
    case HSKLevel.HSK2:
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        badge: 'bg-blue-100 text-blue-800 border border-blue-200',
        primary: 'bg-blue-600 hover:bg-blue-700',
        light: 'bg-blue-50 text-blue-700',
        ring: 'focus:ring-blue-500'
      };
    case HSKLevel.HSK3:
      return {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        badge: 'bg-orange-100 text-orange-800 border border-orange-200',
        primary: 'bg-orange-600 hover:bg-orange-700',
        light: 'bg-orange-50 text-orange-700',
        ring: 'focus:ring-orange-500'
      };
    case HSKLevel.HSK4:
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-700',
        badge: 'bg-red-100 text-red-800 border border-red-200',
        primary: 'bg-red-600 hover:bg-red-700',
        light: 'bg-red-50 text-red-700',
        ring: 'focus:ring-red-500'
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
        badge: 'bg-gray-100 text-gray-800 border border-gray-200',
        primary: 'bg-gray-600 hover:bg-gray-700',
        light: 'bg-gray-50 text-gray-700',
        ring: 'focus:ring-gray-500'
      };
  }
};
