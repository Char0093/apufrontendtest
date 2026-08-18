import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  UploadCloud, 
  FileAudio, 
  Sparkles, 
  Search, 
  User, 
  Plus, 
  ChevronDown, 
  Calendar,
  Clock
} from 'lucide-react';
import { Meeting, Employee } from '../types';
import { INITIAL_EMPLOYEES_DATA } from '../mock/mockData';
import { useNotifications } from '../context/NotificationContext';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (newMeeting: Meeting) => void;
  availableProjects: string[];
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  availableProjects
}) => {
  const { createInvitationNotifications, triggerAiPipelineComplete } = useNotifications();

  const [title, setTitle] = useState('');
  const [project, setProject] = useState(availableProjects[0] || 'Core Engine v2');
  const [customProject, setCustomProject] = useState('');

  // Date and Time state
  const todayStr = new Date().toISOString().split('T')[0];
  const [meetingDate, setMeetingDate] = useState(todayStr);
  const [meetingTime, setMeetingTime] = useState('10:00');
  
  // Multi-Select Combobox State for Employees
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([
    INITIAL_EMPLOYEES_DATA[7], // Alex Rivers
    INITIAL_EMPLOYEES_DATA[2]  // Elena Rostova
  ]);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Close combobox dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Filter available employees not yet selected
  const availableEmployees = INITIAL_EMPLOYEES_DATA.filter(
    emp => !selectedEmployees.some(s => s.id === emp.id)
  );

  const filteredEmployees = availableEmployees.filter(emp =>
    emp.name.toLowerCase().includes(employeeSearchQuery.toLowerCase()) ||
    emp.department.toLowerCase().includes(employeeSearchQuery.toLowerCase()) ||
    emp.email.toLowerCase().includes(employeeSearchQuery.toLowerCase()) ||
    (emp.role && emp.role.toLowerCase().includes(employeeSearchQuery.toLowerCase()))
  );

  const handleAddEmployee = (emp: Employee) => {
    setSelectedEmployees(prev => [...prev, emp]);
    setEmployeeSearchQuery('');
  };

  const handleRemoveEmployee = (empId: string) => {
    setSelectedEmployees(prev => prev.filter(e => e.id !== empId));
  };

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

  const formatScheduledDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr) return 'Aug 10, 2026 • 10:00 AM';
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const monthName = dateObj.toLocaleString('en-US', { month: 'short' });
    
    let timeFormatted = timeStr;
    if (timeStr) {
      const [h, m] = timeStr.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const formattedH = h % 12 || 12;
      const formattedM = m < 10 ? `0${m}` : `${m}`;
      timeFormatted = `${formattedH}:${formattedM} ${ampm}`;
    }
    
    return `${monthName} ${day}, ${year} • ${timeFormatted}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);

    const finalProject = project === 'NEW' ? (customProject.trim() || 'General') : project;
    const participantNames = selectedEmployees.map(e => e.name);
    const formattedDateTime = formatScheduledDateTime(meetingDate, meetingTime);

    setTimeout(() => {
      const hasAudio = !!selectedFile;
      const createdMeeting: Meeting = {
        id: `mtg-${Date.now().toString().slice(-4)}`,
        title: title.trim(),
        project: finalProject,
        dateTime: formattedDateTime,
        participants: participantNames.length > 0 ? participantNames : ['Alex Rivers', 'Elena Rostova'],
        status: hasAudio ? 'Pending' : 'Scheduled',
        audioFileName: hasAudio ? selectedFile!.name : undefined,
        fileSize: hasAudio ? `${(selectedFile!.size / (1024 * 1024)).toFixed(1)} MB` : undefined,
        duration: '45m',
        decisions: [],
        actionItems: [],
        transcript: []
      };

      onUpload(createdMeeting);
      
      // Trigger invitation notifications for participants
      createInvitationNotifications(
        createdMeeting.id,
        createdMeeting.title,
        meetingDate,
        meetingTime,
        createdMeeting.participants
      );

      // If audio file was attached, send FormData payload to backend handoff endpoint
      if (hasAudio) {
        const formData = new FormData();
        formData.append('meetingId', createdMeeting.id);
        formData.append('title', createdMeeting.title);
        formData.append('audio_file', selectedFile!);
        formData.append('participants', JSON.stringify(createdMeeting.participants));

        // Send payload to backend endpoint
        fetch('/api/meetings/upload', {
          method: 'POST',
          body: formData
        }).catch((err) => {
          console.log('[Backend Handoff] FormData sent to POST /api/meetings/upload:', {
            meetingId: createdMeeting.id,
            audioFileName: selectedFile!.name,
            participants: createdMeeting.participants
          });
        });
      }

      setIsSubmitting(false);
      setTitle('');
      setSelectedFile(null);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in font-sans">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Create / Schedule Meeting</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Schedule a meeting now or attach recording for AI analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Meeting Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Sprint Planning & Technical Debt Review"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-hidden focus:border-blue-600 placeholder-slate-400 transition-all"
            />
          </div>

          {/* Project Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Project Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:border-blue-600 cursor-pointer"
              >
                {availableProjects.map((proj) => (
                  <option key={proj} value={proj}>{proj}</option>
                ))}
                <option value="NEW">+ Create New Project...</option>
              </select>
              {project === 'NEW' && (
                <input
                  type="text"
                  placeholder="New Project Name"
                  value={customProject}
                  onChange={(e) => setCustomProject(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600"
                />
              )}
            </div>
          </div>

          {/* Meeting Date & Time (2-column row) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Meeting Date *
              </label>
              <input
                type="date"
                required
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:border-blue-600 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Meeting Time *
              </label>
              <input
                type="time"
                required
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-hidden focus:border-blue-600 transition-all"
              />
            </div>
          </div>

          {/* Multi-Select Combobox for Participants */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Meeting Participants (Invited Team Members)
            </label>
            
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 space-y-2 focus-within:border-blue-600 transition-all">
              {/* Selected Employee Chips */}
              <div className="flex flex-wrap gap-1.5">
                {selectedEmployees.map((emp) => (
                  <span
                    key={emp.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-xs font-semibold shadow-2xs"
                  >
                    <User className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>{emp.name}</span>
                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.2 rounded-md font-medium">
                      {emp.department}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmployee(emp.id)}
                      className="p-0.5 rounded-full hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-500 hover:text-blue-900 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Combobox Search Input */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder={
                    selectedEmployees.length === 0 
                      ? "Search & select team members (e.g., Alex Rivers)..." 
                      : "Type name or department to add more..."
                  }
                  value={employeeSearchQuery}
                  onChange={(e) => {
                    setEmployeeSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-hidden focus:border-blue-600 placeholder-slate-400"
                />
                <ChevronDown 
                  className={`w-3.5 h-3.5 absolute right-2.5 text-slate-400 transition-transform cursor-pointer ${
                    isDropdownOpen ? 'rotate-180 text-blue-600' : ''
                  }`}
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                />
              </div>
            </div>

            {/* Employee Dropdown Popup List */}
            {isDropdownOpen && (
              <div className="relative z-30">
                <div className="absolute top-1 left-0 right-0 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl divide-y divide-slate-100 dark:divide-slate-800 animate-fade-in">
                  {filteredEmployees.length > 0 ? (
                    filteredEmployees.map((emp) => (
                      <div
                        key={emp.id}
                        onClick={() => handleAddEmployee(emp)}
                        className="p-2.5 hover:bg-blue-50/80 dark:hover:bg-slate-800 cursor-pointer transition-colors flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0">
                            {emp.name.charAt(0)}
                          </div>
                          <div className="truncate">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                                {emp.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-medium border border-slate-200 dark:border-slate-700">
                                {emp.department}
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 font-semibold text-[11px] flex items-center gap-1 transition-colors shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      No matching employees found in database.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Audio Upload Zone (OPTIONAL) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Audio Recording (MP3, WAV, M4A)
              </label>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                Optional - Can upload post-meeting
              </span>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
                selectedFile
                  ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 hover:border-blue-500 dark:hover:border-blue-500'
              }`}
            >
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
                id="audio-file-input"
              />
              <label htmlFor="audio-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                {selectedFile ? (
                  <>
                    <FileAudio className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                    <div>
                      <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{selectedFile.name}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Click to change file
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-1" />
                    <p className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
                      Drag & drop recording file, or <span className="text-blue-600 dark:text-blue-400 underline">browse</span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Attach audio now to immediately trigger AI transcription & decision extraction</p>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Dynamic Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {selectedFile ? (
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>Processing AI Pipeline...</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-blue-200" />
                    <span>Create & Start AI Pipeline</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 shadow-md flex items-center gap-2 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>Scheduling...</>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    <span>Schedule / Create Meeting</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
