import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import {
  X,
  UploadCloud,
  FileAudio,
  FileVideo,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Meeting } from '../types';
import * as api from '../services/api';
import { useApp } from '../context/AppContext';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (newMeeting: Meeting) => void;
  availableProjects?: string[];
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  availableProjects = ['Core Engine v2', 'Enterprise Core Platform', 'Coco AI Intelligence', 'Design Systems']
}) => {
  const { currentUser, processAudioForMeeting } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [project, setProject] = useState(availableProjects[0] || 'Core Engine v2');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('Starting AI Pipeline...');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    const validExtensions = ['.mp4', '.wav', '.mp3', '.m4a', '.webm'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
      setError('Please upload a valid audio or video file (.mp4, .wav, .mp3, .m4a)');
      return;
    }

    setError(null);
    setSelectedFile(file);

    // Auto fill title if empty
    if (!title.trim()) {
      const cleanTitle = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      setTitle(cleanTitle);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !title.trim()) return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSubmitMessage('Uploading to backend AI engine...');

    try {
      // STEP 1: Upload to backend — get the real server-assigned UUID
      const { meeting_id: backendId } = await api.uploadMeeting(
        selectedFile,
        title.trim(),
        project
      );

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // STEP 2: Build the placeholder meeting using the REAL backend UUID
      const createdMeeting: Meeting = {
        id: backendId,
        title: title.trim(),
        project,
        dateTime: `${dateStr} ${timeStr}`,
        participants: [currentUser.name],
        status: 'Preprocessing',
        audioFileName: selectedFile.name,
        fileSize: `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`,
        duration: 'Processing...',
        progressPercentage: 15,
        currentStepMessage: 'Extracting audio (ffmpeg: video → 16kHz WAV)...',
        decisions: [],
        actionItems: [],
        transcript: []
      };

      // STEP 3: Register meeting in UI with real ID
      onUpload(createdMeeting);

      // STEP 4: Start polling using the real backend UUID (no upload inside)
      processAudioForMeeting(backendId, selectedFile, createdMeeting);

      // STEP 5: Close modal
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Upload failed. Please check the backend is running.';
      setError(msg);
      setSubmitMessage('Upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-fade-in font-sans">
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-blue-600/30">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Upload & Process Meeting
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Deepgram transcription, speaker diarization, vision, and Gemini AI analysis
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 bg-white dark:bg-slate-900">

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center gap-2.5 text-xs font-bold text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Drag & Drop File Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              isDragging
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 scale-[1.01]'
                : selectedFile
                ? 'border-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/20'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:border-blue-400 dark:hover:border-blue-600'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".mp4,.wav,.mp3,.m4a,.webm,video/*,audio/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            {selectedFile ? (
              <div className="space-y-1 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                  {selectedFile.name.endsWith('.mp4') || selectedFile.name.endsWith('.webm') ? (
                    <FileVideo className="w-6 h-6" />
                  ) : (
                    <FileAudio className="w-6 h-6" />
                  )}
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-sm">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-400 font-semibold">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready for AI processing
                </p>
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold hover:underline inline-block mt-1">
                  Click to choose a different file
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 text-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto mb-2">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Drop your meeting recording here, or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                </p>
                <p className="text-xs text-slate-400 font-medium">
                  Supports MP4 video, WAV, MP3, and M4A audio files
                </p>
              </div>
            )}
          </div>

          {/* Meeting Title Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Meeting Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Cloud Architecture & Security Governance Sync"
              required
              className="w-full px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
            />
          </div>

          {/* Project Tag */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Associated Project
            </label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors cursor-pointer"
            >
              {availableProjects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !selectedFile || !title.trim()}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/25 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSubmitting ? submitMessage : 'Start AI Pipeline & Extract Intelligence'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>,
    document.body
  );
};
