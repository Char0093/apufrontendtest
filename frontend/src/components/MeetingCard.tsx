import React, { useState } from 'react';
import { Meeting } from '../types';
import { useApp } from '../context/AppContext';
import { StatusBadge } from './StatusBadge';
import { 
  Calendar, 
  Clock, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  FileAudio,
  Sparkles,
  UploadCloud
} from 'lucide-react';

interface MeetingCardProps {
  meeting: Meeting;
  onMarkAsDone?: (meetingId: string) => void;
  onViewDetails?: (meeting: Meeting) => void;
  onOpenPostMeetingUpload?: (meeting: Meeting) => void;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({
  meeting,
  onMarkAsDone,
  onViewDetails,
  onOpenPostMeetingUpload
}) => {
  const { openDmWithUser } = useApp();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const isCompleted = meeting.status === 'Completed';

  const handleMarkAsDoneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTransitioning(true);
    setTimeout(() => {
      if (onMarkAsDone) {
        onMarkAsDone(meeting.id);
      }
      setIsTransitioning(false);
    }, 400);
  };

  return (
    <div
      className={`group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-all duration-300 ${
        isTransitioning 
          ? 'scale-95 opacity-0 -translate-y-2 border-emerald-400 shadow-md shadow-emerald-100' 
          : 'hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md'
      }`}
    >
      {/* Top Header: Project Pill & Status */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-semibold border border-blue-100 dark:border-blue-900">
          {meeting.project}
        </span>
        <StatusBadge status={meeting.status} />
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
            {meeting.title}
          </h3>
          {meeting.audioFileName ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
              <FileAudio className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="truncate">{meeting.audioFileName}</span>
              {meeting.fileSize && <span className="text-slate-400">({meeting.fileSize})</span>}
            </p>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-1">
              <UploadCloud className="w-3.5 h-3.5 shrink-0" />
              <span>Awaiting Audio Recording</span>
            </p>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{meeting.dateTime}</span>
          </div>
          {meeting.duration && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{meeting.duration}</span>
            </div>
          )}
        </div>

        {/* Participant Tags */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
            <Users className="w-3 h-3" /> Participants
          </div>
          <div className="flex flex-wrap gap-1.5">
            {meeting.participants.map((person, idx) => (
              <span
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  openDmWithUser(person);
                }}
                className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-300 text-xs font-medium border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                title={`Click to send direct message to ${person}`}
              >
                {person}
              </span>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
          {isCompleted ? (
            <button
              onClick={() => onViewDetails && onViewDetails(meeting)}
              className="w-full py-2.5 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold text-xs flex items-center justify-center gap-2 transition-all group/btn cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover/btn:scale-110 transition-transform" />
              <span>View Decision Intelligence</span>
              <ArrowRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (onOpenPostMeetingUpload) {
                    onOpenPostMeetingUpload(meeting);
                  }
                }}
                className="py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Recording</span>
              </button>

              <button
                onClick={handleMarkAsDoneClick}
                className="py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Mark Done</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
