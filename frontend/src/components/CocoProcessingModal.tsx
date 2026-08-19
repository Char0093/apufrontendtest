import React from 'react';
import ReactDOM from 'react-dom';
import {
  X,
  Bot,
  CheckCircle2,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { Meeting } from '../types';

interface Step {
  id: string;
  title: string;
  subtitle: string;
  threshold: number;
}

const PIPELINE_STEPS: Step[] = [
  {
    id: 'audio',
    title: 'Extracting audio',
    subtitle: 'ffmpeg: video → 16kHz WAV',
    threshold: 15,
  },
  {
    id: 'diarization',
    title: 'Speaker diarization',
    subtitle: 'Deepgram detecting speakers',
    threshold: 30,
  },
  {
    id: 'transcription',
    title: 'Transcription',
    subtitle: 'Deepgram transcribing and separating speakers...',
    threshold: 45,
  },
  {
    id: 'aligning',
    title: 'Aligning speakers',
    subtitle: 'Matching speakers to transcript segments',
    threshold: 60,
  },
  {
    id: 'vision',
    title: 'Gemini Vision',
    subtitle: 'Gemini Vision reading participant names from video...',
    threshold: 75,
  },
  {
    id: 'analysis',
    title: 'AI Analysis',
    subtitle: 'Gemini extracting decisions & action items',
    threshold: 88,
  },
  {
    id: 'storage',
    title: 'Saving results',
    subtitle: 'Saving meeting intelligence to storage',
    threshold: 95,
  },
  {
    id: 'complete',
    title: 'Complete',
    subtitle: 'Meeting intelligence indexed to memory graph',
    threshold: 100,
  },
];

interface CocoProcessingModalProps {
  isOpen: boolean;
  meeting: Meeting | null;
  onClose: () => void;
  onViewMeeting?: (meeting: Meeting) => void;
}

export const CocoProcessingModal: React.FC<CocoProcessingModalProps> = ({
  isOpen,
  meeting,
  onClose,
  onViewMeeting,
}) => {
  if (!isOpen || !meeting) return null;

  const progress = Math.min(100, Math.max(5, meeting.progressPercentage || (meeting.status === 'Completed' ? 100 : 25)));
  const isCompleted = meeting.status === 'Completed' || progress >= 100;

  let activeStepIndex = 0;
  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    if (progress >= PIPELINE_STEPS[i].threshold) {
      activeStepIndex = i + 1;
    } else {
      activeStepIndex = i;
      break;
    }
  }
  if (isCompleted) activeStepIndex = PIPELINE_STEPS.length;

  const currentStep = PIPELINE_STEPS[Math.min(activeStepIndex, PIPELINE_STEPS.length - 1)];

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in font-sans">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Top Header with Coco Avatar, Progress %, and Close button */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-600/30">
              <Bot className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                {isCompleted ? 'Meeting Intelligence Ready!' : 'Coco is processing your meeting'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
                {isCompleted
                  ? 'All decisions, action items, and memory graph nodes are indexed.'
                  : (meeting.currentStepMessage || currentStep?.subtitle || 'Processing meeting intelligence pipeline...')}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
              {progress}%
            </span>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close & continue in background"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Gradient Progress Bar */}
        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            style={{ width: `${progress}%` }}
            className="h-full bg-gradient-to-r from-blue-600 via-teal-400 to-emerald-400 transition-all duration-500"
          />
        </div>

        {/* Steps List */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 bg-white dark:bg-slate-900">
          {PIPELINE_STEPS.map((step, idx) => {
            const isStepDone = progress >= step.threshold || isCompleted;
            const isStepActive = !isStepDone && idx === activeStepIndex;

            return (
              <div
                key={step.id}
                className={`flex items-start space-x-3.5 transition-all ${
                  isStepDone
                    ? 'opacity-100'
                    : isStepActive
                    ? 'opacity-100'
                    : 'opacity-40 dark:opacity-30'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isStepDone ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  ) : isStepActive ? (
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center animate-spin">
                      <Loader2 className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-slate-300 dark:border-slate-700 flex items-center justify-center" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-0.5">
                  <p
                    className={`text-xs font-bold ${
                      isStepDone
                        ? 'text-slate-900 dark:text-white'
                        : isStepActive
                        ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                    {step.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            You can close this window at any time. Processing continues in the background.
          </p>

          {isCompleted && onViewMeeting ? (
            <button
              onClick={() => {
                onViewMeeting(meeting);
                onClose();
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20 cursor-pointer shrink-0"
            >
              <span>Open Intelligence</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shrink-0"
            >
              Run in Background
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body
  );
};
