import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Brain, 
  Lock, 
  User, 
  ArrowRight
} from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { isLoggedIn, login } = useApp();
  const [username, setUsername] = useState('Thim Yee Song');
  const [password, setPassword] = useState('123');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');

  if (isLoggedIn) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    const success = login(username, password);
    if (!success) {
      setError('Authentication failed. Please check your credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 w-full min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 font-sans animate-fade-in p-4 sm:p-6 overflow-y-auto">
      {/* Login Card */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xl p-6 sm:p-8 text-slate-900 dark:text-white my-auto">
        
        {/* Header Section */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-600/30">
            <Brain className="w-7 h-7" />
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans pt-1">
            Corporate Brain
          </h1>

          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2 leading-relaxed">
            Enter your corporate credentials to access your meeting intelligence workspace.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-semibold text-center">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
                placeholder="Enter username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
                placeholder="Password"
                required
              />
            </div>
          </div>

          {/* Remember me & Forgot password row */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center space-x-2 cursor-pointer text-slate-600 dark:text-slate-400 font-medium">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Remember me</span>
            </label>
            <a href="#forgot" onClick={(e) => e.preventDefault()} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
              Forgot password?
            </a>
          </div>

          {/* Primary CTA Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-600/30 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] cursor-pointer mt-2"
          >
            <span>Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

      </div>
    </div>
  );
};
