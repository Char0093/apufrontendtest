import React from 'react';
import { ProcessingStatus } from '../types/meeting';
import {
  Clock,
  Cpu,
  Mic,
  Sparkles,
  Share2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

interface StatusBadgeProps {
  status: ProcessingStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-1 text-xs gap-1.5 font-medium',
    lg: 'px-3 py-1.5 text-sm gap-2 font-semibold',
  }[size];

  switch (status) {
    case 'Scheduled':
      return (
        <span className={`inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>Scheduled</span>
        </span>
      );

    case 'Pending':
      return (
        <span className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Pending</span>
        </span>
      );

    case 'Preprocessing':
      return (
        <span className={`inline-flex items-center rounded-full bg-blue-50 text-blue-800 border border-blue-200 ${sizeClasses}`}>
          <Cpu className="w-3.5 h-3.5 text-blue-600 animate-spin" />
          <span>Preprocessing</span>
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping ml-0.5" />
        </span>
      );

    case 'ASR':
      return (
        <span className={`inline-flex items-center rounded-full bg-sky-50 text-sky-800 border border-sky-200 ${sizeClasses}`}>
          <Mic className="w-3.5 h-3.5 text-sky-600 animate-bounce" />
          <span>ASR (Speech-to-Text)</span>
        </span>
      );

    case 'LLM':
      return (
        <span className={`inline-flex items-center rounded-full bg-purple-50 text-purple-800 border border-purple-200 ${sizeClasses}`}>
          <Sparkles className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
          <span>LLM Extraction</span>
        </span>
      );

    case 'Graph':
      return (
        <span className={`inline-flex items-center rounded-full bg-blue-50 text-blue-800 border border-blue-200 ${sizeClasses}`}>
          <Share2 className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
          <span>Graph Construction</span>
        </span>
      );

    case 'Completed':
      return (
        <span className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 ${sizeClasses}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Completed</span>
        </span>
      );

    case 'Retrying':
      return (
        <span className={`inline-flex items-center rounded-full bg-orange-50 text-orange-800 border border-orange-200 ${sizeClasses}`}>
          <RefreshCw className="w-3.5 h-3.5 text-orange-600 animate-spin" />
          <span>Retrying after error</span>
        </span>
      );

    case 'Failed':
      return (
        <span className={`inline-flex items-center rounded-full bg-red-50 text-red-800 border border-red-200 ${sizeClasses}`}>
          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          <span>Failed</span>
        </span>
      );

    default:
      return null;
  }
};
