import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Brain, 
  Lock, 
  User, 
  ArrowRight
} from 'lucide-react';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme: string; size: string; width?: string; text?: string }
          ) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export const LoginModal: React.FC = () => {
  const {
    isLoggedIn,
    login,
    loginWithGoogle,
    sessionExpired,
    pendingGoogleIdentity,
    claimGoogleIdentity,
    cancelGoogleIdentityChoice,
  } = useApp();
  const [username, setUsername] = useState('Thim Yee Song');
  const [password, setPassword] = useState('123');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  // loginWithGoogle is a fresh function reference on every AppProvider
  // render, not just when isLoggedIn changes. Reading it via ref instead of
  // listing it as an effect dependency keeps the callback always up to date
  // without re-running script loading / re-initializing the GSI button on
  // every unrelated re-render (was firing "initialize() is called multiple
  // times" from Google's own SDK).
  const loginWithGoogleRef = useRef(loginWithGoogle);
  useEffect(() => {
    loginWithGoogleRef.current = loginWithGoogle;
  }, [loginWithGoogle]);

  useEffect(() => {
    if (isLoggedIn || !GOOGLE_CLIENT_ID) return;

    const renderGoogleButton = () => {
      if (!googleButtonRef.current || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          if (!response.credential) {
            setError('Google did not return a credential.');
            return;
          }
          setGoogleLoading(true);
          setError('');
          const success = await loginWithGoogleRef.current(response.credential);
          if (!success) {
            setError('Google sign-in could not be verified by the backend.');
          }
          setGoogleLoading(false);
        },
      });
      googleButtonRef.current.innerHTML = '';
      // GSI's width option wants a pixel number as a string, not a CSS
      // percentage (which it silently rejects, logging "Provided button
      // width is invalid") — measure the container instead, capped at
      // Google's documented 400px maximum.
      const width = Math.min(400, googleButtonRef.current.offsetWidth || 400);
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: String(width),
        text: 'signin_with',
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) renderGoogleButton();
      else existing.addEventListener('load', renderGoogleButton, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    script.onerror = () => setError('Could not load Google sign-in. Use demo login instead.');
    document.head.appendChild(script);
  }, [isLoggedIn]);

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

  const handleClaim = async (employeeId: string | null) => {
    setClaiming(true);
    setError('');
    const success = await claimGoogleIdentity(employeeId);
    if (!success) {
      setError('Could not link that identity. Please try again.');
    }
    setClaiming(false);
  };

  if (pendingGoogleIdentity) {
    return (
      <div className="fixed inset-0 z-50 w-full min-h-screen flex items-center justify-center bg-white dark:bg-slate-950 font-sans animate-fade-in p-4 sm:p-6 overflow-y-auto">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xl p-6 sm:p-8 text-slate-900 dark:text-white my-auto">
          <div className="text-center space-y-2 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-600/30">
              <Brain className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans pt-1">
              Which team member is this?
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium px-2 leading-relaxed">
              Signed in with Google as <span className="font-bold">{pendingGoogleIdentity.googleName}</span>. Pick your workspace identity to link your existing meetings and tasks.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-semibold text-center">
              {error}
            </div>
          )}

          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {pendingGoogleIdentity.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={claiming}
                onClick={() => handleClaim(opt.id)}
                className="w-full text-left px-4 py-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="text-xs font-bold text-slate-900 dark:text-white">{opt.name}</div>
                {opt.title && <div className="text-[11px] text-slate-500 dark:text-slate-400">{opt.title}</div>}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span>or</span>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <button
            type="button"
            disabled={claiming}
            onClick={() => handleClaim(null)}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm shadow-blue-600/30 transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-60"
          >
            None of these — continue as a new user
          </button>

          <button
            type="button"
            onClick={cancelGoogleIdentityChoice}
            className="w-full mt-3 py-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:underline text-center"
          >
            Cancel and use a different account
          </button>
        </div>
      </div>
    );
  }

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

        {!error && sessionExpired && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-400 font-semibold text-center">
            Your session expired — please sign in again.
          </div>
        )}

        <div className="mb-4 space-y-3">
          {GOOGLE_CLIENT_ID ? (
            <div className="min-h-11">
              <div ref={googleButtonRef} className={googleLoading ? 'pointer-events-none opacity-60' : ''} />
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              Google OAuth is disabled until VITE_GOOGLE_CLIENT_ID is configured.
            </div>
          )}
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span>or demo login</span>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>

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
