import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Calendar, 
  Clock, 
  Users, 
  FileText, 
  Building2, 
  Send, 
  Check,
  Sparkles,
  Upload,
  Search,
  FileAudio
} from 'lucide-react';

export const CreateMeetingModal: React.FC = () => {
  const { isCreateMeetingOpen, setIsCreateMeetingOpen, employees, currentUser, addMeeting } = useApp();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('2026-08-14');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('15:00');
  const [department, setDepartment] = useState('Engineering & AI');
  
  // Find current organizer employee
  const organizerEmp = employees.find(e => e.name.toLowerCase() === currentUser.name.toLowerCase());

  // Participant Selection State — defaults to organizer + other team members
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [participantSearch, setParticipantSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ensure organizer is selected by default when modal opens
  useEffect(() => {
    if (isCreateMeetingOpen) {
      const defaultIds = employees.map(e => e.id).filter(id => id !== (organizerEmp?.id || ''));
      const orgId = organizerEmp ? [organizerEmp.id] : [];
      setSelectedParticipantIds(Array.from(new Set([...orgId, ...defaultIds])));
    }
  }, [isCreateMeetingOpen, organizerEmp, employees]);

  // Optional Audio Upload state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Click outside & Escape key handler to close participant dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropdownOpen]);

  if (!isCreateMeetingOpen) return null;

  // Filtered employees for dropdown
  const filteredEmployees = employees.filter(emp => {
    const query = participantSearch.toLowerCase().trim();
    if (!query) return true;
    return (
      emp.name.toLowerCase().includes(query) ||
      emp.department.toLowerCase().includes(query) ||
      emp.role.toLowerCase().includes(query)
    );
  });

  const selectedEmployees = employees.filter(emp => 
    selectedParticipantIds.includes(emp.id) || (organizerEmp && emp.id === organizerEmp.id)
  );

  const addParticipant = (empId: string) => {
    if (!selectedParticipantIds.includes(empId)) {
      setSelectedParticipantIds(prev => [...prev, empId]);
    }
  };

  const removeParticipant = (empId: string) => {
    if (organizerEmp && empId === organizerEmp.id) return; // Cannot untick organizer!
    setSelectedParticipantIds(prev => prev.filter(id => id !== empId));
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      addMeeting({
        title,
        description,
        date,
        startTime,
        endTime,
        department,
        participantIds: selectedParticipantIds
      });
      setIsSubmitting(false);
      // Reset state
      setTitle('');
      setDescription('');
      setAudioFile(null);
      setParticipantSearch('');
    }, 450);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header - Clean White Styling */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/80 border border-blue-100 dark:border-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Schedule New Meeting</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Auto-dispatches real-time notifications to all tagged participants</p>
            </div>
          </div>

          <button
            onClick={() => setIsCreateMeetingOpen(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1 bg-white dark:bg-slate-900">
          
          {/* Meeting Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Meeting Title *
            </label>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q3 Cloud Architecture & Security Governance Sync"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* Project Category & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Project Category / Scope
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors cursor-pointer"
                >
                  <option value="Engineering & AI">Engineering & AI</option>
                  <option value="Product Strategy">Product Strategy</option>
                  <option value="Infrastructure">Infrastructure</option>
                  <option value="Security & Compliance">Security & Compliance</option>
                  <option value="Finance & Operations">Finance & Operations</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Meeting Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                required
              />
            </div>
          </div>

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Start Time
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                End Time
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                  required
                />
              </div>
            </div>
          </div>

          {/* Searchable Multi-Select Participant Dropdown */}
          <div ref={dropdownRef} className="space-y-2 relative">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Tagged Participants ({selectedEmployees.length} selected)
            </label>

            {/* Rendered Tag Pills Container */}
            <div className="flex flex-wrap gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl min-h-[48px] items-center">
              {selectedEmployees.map((emp) => {
                const isOrganizer = organizerEmp && emp.id === organizerEmp.id;
                return (
                  <span
                    key={emp.id}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1 border rounded-xl text-xs shadow-2xs group ${
                      isOrganizer
                        ? 'bg-blue-50 dark:bg-blue-950/80 border-blue-200 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <img src={emp.avatarUrl} alt={emp.name} className="w-4 h-4 rounded-full object-cover" />
                    <span className="font-bold text-slate-800 dark:text-slate-200">{emp.name}</span>
                    {isOrganizer ? (
                      <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[10px] font-bold rounded-md">
                        Organizer (You)
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300 text-[10px] font-semibold rounded-md">
                        {emp.department}
                      </span>
                    )}
                    {!isOrganizer && (
                      <button
                        type="button"
                        onClick={() => removeParticipant(emp.id)}
                        className="text-slate-400 hover:text-rose-500 transition-colors ml-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </span>
                );
              })}

              {selectedEmployees.length === 0 && (
                <span className="text-xs text-slate-400 italic px-1">No participants tagged yet. Search below to add team members.</span>
              )}
            </div>

            {/* Participant Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={participantSearch}
                onFocus={() => setIsDropdownOpen(true)}
                onChange={(e) => {
                  setParticipantSearch(e.target.value);
                  setIsDropdownOpen(true);
                }}
                placeholder="Search team members by Name or Department..."
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Dropdown Options Box */}
            {isDropdownOpen && (
              <div className="absolute left-0 right-0 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-48 overflow-y-auto p-2 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                  <span>Team Directory Results</span>
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    Close
                  </button>
                </div>

                {filteredEmployees.map((emp) => {
                  const isOrganizer = organizerEmp && emp.id === organizerEmp.id;
                  const isSelected = selectedParticipantIds.includes(emp.id) || isOrganizer;
                  return (
                    <div
                      key={emp.id}
                      onClick={() => {
                        if (isOrganizer) return; // Organizer cannot be toggled
                        if (isSelected) {
                          removeParticipant(emp.id);
                        } else {
                          addParticipant(emp.id);
                        }
                      }}
                      className={`p-2 rounded-xl flex items-center justify-between transition-colors ${
                        isOrganizer
                          ? 'bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 cursor-not-allowed opacity-90'
                          : isSelected
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 cursor-pointer'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5">
                        <img src={emp.avatarUrl} alt={emp.name} className="w-7 h-7 rounded-full object-cover" />
                        <div>
                          <div className="text-xs font-bold flex items-center gap-1.5">
                            <span>{emp.name}</span>
                            {isOrganizer && (
                              <span className="px-1.5 py-0.2 bg-blue-600 text-white text-[9px] font-bold rounded-md">
                                Organizer (You)
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">{emp.role} • <span className="font-semibold text-blue-500">{emp.department}</span></div>
                        </div>
                      </div>

                      <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                        isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 text-transparent'
                      }`}>
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audio Recording Upload Zone (Optional - Can upload post-meeting) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
                <FileAudio className="w-4 h-4 text-blue-500" />
                <span>Audio Recording</span>
              </label>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 text-[10px] font-bold border border-amber-200 dark:border-amber-900">
                Optional - Can upload post-meeting
              </span>
            </div>

            <div className="relative border-2 border-dashed border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/30 hover:border-blue-400 transition-colors text-center">
              <input
                type="file"
                accept="audio/*,video/mp4,.mp4"
                onChange={handleAudioUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              />
              <div className="flex flex-col items-center space-y-1">
                <Upload className="w-5 h-5 text-slate-400" />
                {audioFile ? (
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                    {audioFile.name} ({(audioFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                ) : (
                  <>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Click or drag audio or video file (MP3, WAV, M4A, MP4)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Optional — Schedule now and upload recording anytime post-meeting.
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Modal Action Footer - Single Primary Button */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsCreateMeetingOpen(false)}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-lg shadow-blue-600/30 flex items-center space-x-2 transition-all disabled:opacity-50 hover:scale-[1.02] cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Dispatching Invites...' : 'Create & Send Invitations'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
