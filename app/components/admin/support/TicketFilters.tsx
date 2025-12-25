'use client';

import { Search, X } from 'lucide-react';

interface TicketFiltersProps {
  filters: {
    status: string[];
    priority: string[];
    category: string[];
    assignedTo: string;
    search: string;
  };
  onFilterChange: (filters: any) => void;
  agents: Array<{ id: string; name: string | null; username: string | null }>;
}

const STATUSES = [
  { value: 'open', label: 'Open', color: 'emerald' },
  { value: 'pending', label: 'Pending', color: 'yellow' },
  { value: 'resolved', label: 'Resolved', color: 'blue' },
  { value: 'closed', label: 'Closed', color: 'gray' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const CATEGORIES = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'dispute', label: 'Dispute' },
  { value: 'bug', label: 'Bug' },
  { value: 'kyc', label: 'KYC' },
  { value: 'general', label: 'General' },
];

export function TicketFilters({ filters, onFilterChange, agents }: TicketFiltersProps) {
  const handleStatusToggle = (status: string) => {
    const newStatuses = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];
    onFilterChange({ ...filters, status: newStatuses });
  };

  const handlePriorityToggle = (priority: string) => {
    const newPriorities = filters.priority.includes(priority)
      ? filters.priority.filter((p) => p !== priority)
      : [...filters.priority, priority];
    onFilterChange({ ...filters, priority: newPriorities });
  };

  const handleCategoryToggle = (category: string) => {
    const newCategories = filters.category.includes(category)
      ? filters.category.filter((c) => c !== category)
      : [...filters.category, category];
    onFilterChange({ ...filters, category: newCategories });
  };

  const handleSearchChange = (search: string) => {
    onFilterChange({ ...filters, search });
  };

  const handleAssignedToChange = (assignedTo: string) => {
    onFilterChange({ ...filters, assignedTo });
  };

  const clearFilters = () => {
    onFilterChange({
      status: [],
      priority: [],
      category: [],
      assignedTo: '',
      search: '',
    });
  };

  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.category.length > 0 ||
    filters.assignedTo !== '' ||
    filters.search !== '';

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search tickets, users..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-emerald-500/50 transition-colors"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {/* Status Filters */}
        {STATUSES.map((status) => (
          <button
            key={status.value}
            onClick={() => handleStatusToggle(status.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filters.status.includes(status.value)
                ? `bg-${status.color}-500/20 text-${status.color}-400 border border-${status.color}-500/30`
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            }`}
          >
            {status.label}
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Priority Filters */}
        {PRIORITIES.map((priority) => (
          <button
            key={priority.value}
            onClick={() => handlePriorityToggle(priority.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filters.priority.includes(priority.value)
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            }`}
          >
            {priority.label}
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-8 bg-white/10" />

        {/* Category Filters */}
        {CATEGORIES.map((category) => (
          <button
            key={category.value}
            onClick={() => handleCategoryToggle(category.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filters.category.includes(category.value)
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      {/* Agent Filter & Clear */}
      <div className="flex items-center gap-3">
        <select
          value={filters.assignedTo}
          onChange={(e) => handleAssignedToChange(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
        >
          <option value="">All Tickets</option>
          <option value="unassigned">Unassigned</option>
          <option value="me">Assigned to Me</option>
          <optgroup label="Agents">
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name || agent.username}
              </option>
            ))}
          </optgroup>
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/30 transition-all flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

