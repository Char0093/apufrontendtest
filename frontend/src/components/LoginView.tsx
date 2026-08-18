import React, { useState } from 'react';
import { 
  Brain, 
  ShieldCheck, 
  ArrowRight, 
  Sparkles, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Key, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle2
} from 'lucide-react';
import { UserProfile } from '../types';

export const MOCK_LOGIN_USERS: UserProfile[] = [
  {
    id: 'emp-001',
    name: 'Alice Chen',
    title: 'Lead Cloud Architect',
    role: 'Lead Cloud Architect',
    department: 'Infrastructure',
    email: 'alice.chen@corporatebrain.ai',
    phone: '+60 12-345 6789',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    preferences: {
      emailActionItems: true,
      meetingAiAnalysis: true,
      systemUpdates: false
    }
  },
  {
    id: 'emp-005',
    name: 'Marcus Vance',
    title: 'VP of Enterprise Sales',
    role: 'VP of Enterprise Sales',
    department: 'Enterprise Sales',
    email: 'marcus.vance@corporatebrain.ai',
    phone: '+60 12-876 5432',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    preferences: {
      emailActionItems: true,
      meetingAiAnalysis: true,
      systemUpdates: true
    }
  },
  {
    id: 'emp-006',
    name: 'David Kim',
    title: 'DevOps & SecOps Lead',
    role: 'DevOps & SecOps Lead',
    department: 'Security & Compliance',
    email: 'david.kim@corporatebrain.ai',
    phone: '+60 12-333 4444',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    preferences: {
      emailActionItems: false,
      meetingAiAnalysis: true,
      systemUpdates: true
    }
  },
  {
    id: 'emp-003',
    name: 'Elena Rostova',
    title: 'Principal Software Architect',
    role: 'Principal Software Architect',
    department: 'Core Infrastructure',
    email: 'elena.rostova@corporatebrain.ai',
    phone: '+60 12-456 7890',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    preferences: {
      emailActionItems: true,
      meetingAiAnalysis: true,
      systemUpdates: false
    }
  }
];

interface LoginViewProps {
  onLogin: (user: UserProfile) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('alice.chen@corporatebrain.ai');
  const [password, setPassword] = useState('••••••••••••');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim()) {
      setErrorMsg('Please enter your work email address.');
      return;
    }

    const matchedUser = MOCK_LOGIN_USERS.find(
      u => u.email.toLowerCase().trim() === email.toLowerCase().trim()
    );

    if (matchedUser) {
      onLogin(matchedUser);
    } else {
      setErrorMsg('Invalid employee credentials. Please check your email address.');
    }
  };

  const handleQuickLoginPill = (user: UserProfile) => {
    setEmail(user.email);
    setPassword('••••••••••••');
    setErrorMsg('');
    onLogin(user);
  };

  const handleForgotPassword = (e: React.MouseEvent) => {
    e.preventDefault();
    setToastMsg('SSO password reset instructions have been sent to your administrator.');
    setTimeout(() => setToastMsg(''), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background Decorative Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed top-6 z-50 flex items-center gap-3 bg-slate-900 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      <div className="max-w-md w-full space-y-6 relative z-10">
        {/* Branding & Logo Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/20 backdrop-blur-md shadow-md">
            <Brain className="w-6 h-6 text-blue-400" />
            <span className="text-sm font-bold tracking-tight text-white">Corporate Brain Enterprise</span>
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Single Sign-On (SSO)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Sign in with your enterprise credentials to access meeting intelligence & decision graphs.
          </p>
        </div>

        {/* Primary Enterprise Login Form Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
          {/* Inline Error Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {/* Work Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Work Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="e.g. alice.chen@corporatebrain.ai"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Field with Show/Hide Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 block">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your SSO password"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 cursor-pointer"
                />
                <span>Remember Me</span>
              </label>

              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-blue-400 hover:text-blue-300 font-semibold hover:underline cursor-pointer"
              >
                Forgot Password?
              </button>
            </div>

            {/* Primary Sign In Button */}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer hover:scale-[1.01]"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In with SSO</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Collapsible Demo Quick-Login Accordion */}
          <div className="pt-3 border-t border-slate-800 space-y-3">
            <button
              type="button"
              onClick={() => setIsDemoOpen(!isDemoOpen)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 hover:bg-slate-950 border border-slate-800/80 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-blue-400" />
                <span>Need Demo Access? Select Test Account</span>
              </div>
              {isDemoOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {isDemoOpen && (
              <div className="space-y-2 animate-in fade-in duration-200 pt-1">
                <p className="text-[11px] text-slate-400">Click any profile below to instantly authenticate as that employee:</p>
                <div className="grid grid-cols-1 gap-2">
                  {MOCK_LOGIN_USERS.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleQuickLoginPill(user)}
                      className="p-2.5 rounded-xl bg-slate-950/80 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-500/50 flex items-center justify-between text-left transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="w-8 h-8 rounded-lg object-cover border border-blue-500/30 shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white group-hover:text-blue-300 truncate">
                            {user.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate">{user.title}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 text-[10px] font-mono shrink-0">
                        {user.department}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Security & Compliance Footer */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-center flex items-center justify-center gap-2 text-[11px] text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>SAML 2.0 & Okta Single Sign-On Enforced • Corporate Brain Enterprise v2.4</span>
        </div>
      </div>
    </div>
  );
};
