import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Brain, 
  Lock, 
  Mail, 
  Building2, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles
} from 'lucide-react';

export const LoginModal: React.FC = () => {
  const { isLoggedIn, login } = useApp();
  const [email, setEmail] = useState('alex.mercer@corpbrain.ai');
  const [password, setPassword] = useState('••••••••••••');
  const [department, setDepartment] = useState('Engineering & AI');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');

  if (isLoggedIn) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter a valid work email.');
      return;
    }
    const success = login(email, password, department);
    if (!success) {
      setError('Authentication failed. Please check your credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-sans animate-fade-in overflow-y-auto">
      {/* Sleek Crisp White Floating Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl max-w-md w-full p-8 text-slate-900 dark:text-white my-auto">
        
        {/* Header Section */}
        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto shadow-md shadow-indigo-600/30">
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

        {/* Standard Login Form Controls */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Work Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
                placeholder="name@company.com"
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
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors"
                placeholder="••••••••••••"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Department Selection
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-600 focus:bg-white dark:focus:bg-slate-900 focus:outline-none transition-colors cursor-pointer"
              >
                <option value="Engineering & AI">Engineering & AI</option>
                <option value="Core Systems">Core Systems</option>
                <option value="Product Strategy">Product Strategy</option>
                <option value="Executive Ops">Executive Ops</option>
                <option value="ML & Graph Pipeline">ML & Graph Pipeline</option>
                <option value="Legal & Compliance">Legal & Compliance</option>
              </select>
            </div>
          </div>

          {/* Remember me & Forgot password row */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center space-x-2 cursor-pointer text-slate-600 dark:text-slate-400 font-medium">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span>Remember me</span>
            </label>
            <a href="#forgot" onClick={(e) => e.preventDefault()} className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
              Forgot password?
            </a>
          </div>

          {/* Primary CTA Button */}
          <button
            type="submit"
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-indigo-600/30 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] cursor-pointer mt-2"
          >
            <span>Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer Security Badges */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center space-x-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>SOC2 Type II Certified</span>
          </span>
          <span className="flex items-center space-x-1 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>LLM Encryption Active</span>
          </span>
        </div>

      </div>
    </div>
  );
};
