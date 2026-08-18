import React, { useState } from 'react';
import { X, UploadCloud, FileAudio, Sparkles, CheckCircle2 } from 'lucide-react';
import { Meeting } from '../types';
import { useNotifications } from '../context/NotificationContext';

interface PostMeetingUploadModalProps {
  isOpen: boolean;
  meeting: Meeting;
  onClose: () => void;
  onUploadSuccess: (meetingId: string, audioFile: File) => void;
}

export const PostMeetingUploadModal: React.FC<PostMeetingUploadModalProps> = ({
  isOpen,
  meeting,
  onClose,
  onUploadSuccess
}) => {
  const { triggerAiPipelineComplete } = useNotifications();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsProcessing(true);

    // Build FormData payload for backend endpoint handoff
    const formData = new FormData();
    formData.append('meetingId', meeting.id);
    formData.append('title', meeting.title);
    formData.append('audio_file', selectedFile);
    formData.append('participants', JSON.stringify(meeting.participants));

    fetch('/api/meetings/upload', {
      method: 'POST',
      body: formData
    }).catch(() => {
      console.log('[Backend Handoff] POST /api/meetings/upload payload:', {
        meetingId: meeting.id,
        filename: selectedFile.name,
        participants: meeting.participants
      });
    });

    setTimeout(() => {
      onUploadSuccess(meeting.id, selectedFile);
      setIsProcessing(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 relative">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Upload Meeting Recording</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]">
                {meeting.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 space-y-1 text-xs">
            <span className="font-bold text-blue-900 dark:text-blue-300">Scheduled Meeting Context:</span>
            <p className="text-blue-700 dark:text-blue-400">
              Project: <span className="font-semibold">{meeting.project}</span> • Participants: <span className="font-semibold">{meeting.participants.join(', ')}</span>
            </p>
          </div>

          {/* Audio Upload Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Attach Recording File
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                selectedFile
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-blue-500 dark:hover:border-blue-500'
              }`}
            >
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
                id="post-meeting-audio-input"
              />
              <label htmlFor="post-meeting-audio-input" className="cursor-pointer flex flex-col items-center gap-2">
                {selectedFile ? (
                  <>
                    <FileAudio className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-bounce" />
                    <div>
                      <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for AI Pipeline
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-1" />
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                      Drag & drop audio file, or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Supports MP3, WAV, M4A up to 500MB</p>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || isProcessing}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" />
                  <span>Processing AI Intelligence...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload & Start AI Pipeline</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
