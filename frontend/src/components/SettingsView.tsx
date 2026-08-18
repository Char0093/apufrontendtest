import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  User as UserIcon, 
  Sparkles, 
  Sun, 
  Moon, 
  Monitor, 
  Upload, 
  Trash2, 
  Save, 
  CheckCircle2, 
  X,
  Briefcase,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  Palette,
  Chrome,
  Video,
  Clock
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { currentUser, updateCurrentUser, setActiveTab } = useApp();

  // Local form state
  const [name, setName] = useState(currentUser.name || 'Alex Mercer');
  const [role, setRole] = useState(currentUser.role || currentUser.title || 'VP of Product');
  const [department, setDepartment] = useState(currentUser.department || 'Product Strategy');
  const [email, setEmail] = useState(currentUser.email || 'alex.mercer@corpbrain.ai');
  const [phone, setPhone] = useState(currentUser.phone || '+1 (555) 123-4567');
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80');

  // Theme Mode State
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('dark');
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    setName(currentUser.name || 'Alex Mercer');
    setRole(currentUser.role || currentUser.title || 'VP of Product');
    setDepartment(currentUser.department || 'Product Strategy');
    setEmail(currentUser.email || 'alex.mercer@corpbrain.ai');
    setPhone(currentUser.phone || '+1 (555) 123-4567');
    setAvatarUrl(currentUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80');
  }, [currentUser]);

  const handleThemeChange = (mode: 'light' | 'dark' | 'system') => {
    setThemeMode(mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (mode === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateCurrentUser({
      name,
      role,
      title: role,
      department,
      email,
      phone,
      avatarUrl
    });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80');
  };

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 space-y-6 font-sans animate-fade-in pb-16">
      
      {/* Toast Notification Alert */}
      {showToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center space-x-3 border border-blue-400/40 animate-fade-in">
          <div className="p-1.5 bg-white/20 rounded-full">
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold font-sans">Settings Saved Successfully</div>
            <div className="text-[11px] text-blue-100">Your profile and appearance preferences have been updated.</div>
          </div>
          <button onClick={() => setShowToast(false)} className="ml-2 text-blue-200 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Sub-Header Row */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <div className="flex items-center space-x-1.5 text-xs font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400 font-mono mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ACCOUNT MANAGEMENT</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-sans tracking-tight">
              Employee Profile & Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manage your corporate profile, credentials, appearance theme, and notification preferences.
            </p>
          </div>

          <div className="shrink-0">
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-2xl shadow-lg shadow-blue-600/30 flex items-center space-x-2 transition-all hover:scale-[1.02]"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>

        {/* Section 1: Appearance Theme Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900">
                <Palette className="w-5 h-5" />
              </div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white font-sans">
                Appearance Theme
              </h2>
            </div>

            <span className="text-xs font-mono font-bold text-slate-400 uppercase">
              Current: <span className="text-blue-600 dark:text-blue-400">{themeMode}</span>
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Customize how Corporate Brain looks on your device. Choose between light mode, dark mode, or sync with system preferences.
          </p>

          {/* 2 Theme Options Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Light Mode */}
            <div
              onClick={() => handleThemeChange('light')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center space-x-3.5 ${
                themeMode === 'light'
                  ? 'border-2 border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                themeMode === 'light' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'
              }`}>
                <Sun className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Light Mode</div>
                <div className="text-[11px] text-slate-400 font-sans">Clean bright interface</div>
              </div>
            </div>

            {/* Dark Mode */}
            <div
              onClick={() => handleThemeChange('dark')}
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center space-x-3.5 ${
                themeMode === 'dark'
                  ? 'border-2 border-blue-600 bg-blue-50/40 dark:bg-blue-950/40 shadow-sm'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                themeMode === 'dark' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500'
              }`}>
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">Dark Mode</div>
                <div className="text-[11px] text-slate-400 font-sans">High contrast dark theme</div>
              </div>
            </div>

          </div>
        </div>

        {/* Section 2: Personal Information Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center border border-blue-100 dark:border-blue-900">
              <UserIcon className="w-5 h-5" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white font-sans">
              Personal Information
            </h2>
          </div>

          {/* Profile Photo Block */}
          <div className="p-4 bg-slate-50/60 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="relative group shrink-0">
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-blue-500/30"
                />
                <div className="absolute bottom-0 right-0 p-1 bg-blue-600 text-white rounded-lg shadow-sm">
                  <UserIcon className="w-3 h-3" />
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white font-sans">
                  Profile Photo
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm">
                  Upload a high-resolution JPG or PNG avatar. Recommended minimum dimension 200×200px.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                type="button"
                className="px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center space-x-1.5 hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload New Photo</span>
              </button>

              <button
                type="button"
                onClick={handleRemovePhoto}
                className="px-3 py-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-xl text-xs font-bold flex items-center space-x-1 hover:bg-rose-100 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </button>
            </div>
          </div>

          {/* Form Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            
            {/* Full Name (Locked) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Locked</span>
              </div>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  disabled
                  readOnly
                  value={name}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl text-slate-500 dark:text-slate-400 font-semibold cursor-not-allowed select-none"
                />
              </div>
            </div>

            {/* Position / Title (Locked) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Position / Title
                </label>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Locked</span>
              </div>
              <div className="relative">
                <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  disabled
                  readOnly
                  value={role}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl text-slate-500 dark:text-slate-400 font-semibold cursor-not-allowed select-none"
                />
              </div>
            </div>

            {/* Department (Locked) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Department
                </label>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Locked</span>
              </div>
              <div className="relative">
                <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  disabled
                  readOnly
                  value={department}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 rounded-2xl text-slate-500 dark:text-slate-400 font-semibold cursor-not-allowed select-none"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

          </div>
        </div>

      </form>

    </div>
  );
};


