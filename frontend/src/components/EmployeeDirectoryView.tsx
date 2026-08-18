import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  Search, 
  MessageSquare, 
  Mail, 
  Phone, 
  MapPin, 
  Building2, 
  CheckCircle2, 
  X
} from 'lucide-react';

export const EmployeeDirectoryView: React.FC = () => {
  const { employees, openChatWithUser } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');

  const departments = ['All', 'Engineering', 'Product Strategy', 'Finance & Operations', 'Legal & Compliance'];

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = 
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDept === 'All' || emp.department === selectedDept;

    return matchesSearch && matchesDept;
  });

  return (
    <div className="max-w-[1920px] w-full mx-auto px-8 py-6 space-y-6 font-sans animate-fade-in">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold font-sans text-slate-900 dark:text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Employee Directory</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Directory of cross-functional team members, online status, and quick direct message launcher.
          </p>
        </div>

        {/* Department Filters & Search */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name, role..."
              className="pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Department Selector */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
            {departments.map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1 rounded-lg transition-colors ${
                  selectedDept === dept
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* Employee Profile Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.length === 0 ? (
          <div className="col-span-full p-12 text-center text-xs text-slate-400">
            No employees found matching query "{searchQuery}".
          </div>
        ) : (
          filteredEmployees.map((emp) => (
            <div
              key={emp.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
            >
              <div className="space-y-4">
                {/* Employee Header Avatar & Status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="relative">
                      <img
                        src={emp.avatarUrl}
                        alt={emp.name}
                        className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-500/20"
                      />
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                          emp.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                        title={emp.isOnline ? 'Online' : 'Offline'}
                      ></span>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans group-hover:text-blue-600 transition-colors">
                        {emp.name}
                      </h3>
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {emp.role}
                      </div>
                    </div>
                  </div>

                  <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-md">
                    {emp.department}
                  </span>
                </div>

                {/* Bio */}
                {emp.bio && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2 italic">
                    "{emp.bio}"
                  </p>
                )}

                {/* Details List */}
                <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center space-x-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a
                      href={`mailto:${emp.email}`}
                      className="truncate text-slate-500 dark:text-slate-400 hover:underline"
                    >
                      {emp.email}
                    </a>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <a
                      href={`tel:${emp.phone.replace(/[^0-9+]/g, '')}`}
                      className="text-slate-500 dark:text-slate-400 hover:underline"
                    >
                      {emp.phone}
                    </a>
                  </div>

                  {emp.location && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{emp.location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Action Footer: Direct Message Button */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-1 text-[10px] text-slate-400">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>{emp.isOnline ? 'Active Now' : 'Last seen 2h ago'}</span>
                </div>

                <button
                  onClick={() => openChatWithUser(emp.id)}
                  className="px-3.5 py-1.5 bg-blue-50 dark:bg-blue-950/80 hover:bg-blue-600 text-blue-600 dark:text-blue-400 hover:text-white text-xs font-semibold rounded-xl border border-blue-200 dark:border-blue-800/60 flex items-center space-x-1.5 transition-all shadow-xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Direct Message</span>
                </button>
              </div>

            </div>
          ))
        )}
      </div>

    </div>
  );
};
