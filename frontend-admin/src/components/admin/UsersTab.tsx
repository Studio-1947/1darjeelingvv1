import { useState } from 'react';
import { Check, X, Trash2, Users as UsersIcon, Store } from 'lucide-react';

interface UsersTabProps {
  users: any[];
  onDeleteUser: (userId: string, name: string) => Promise<void>;
  onToggleProviderStatus: (providerId: string, currentStatus: string) => Promise<void>;
}

/**
 * UsersTab displays registered system users and businesses split into dedicated sections.
 */
export default function UsersTab({ users, onDeleteUser, onToggleProviderStatus }: UsersTabProps) {
  const [subTab, setSubTab] = useState<'individuals' | 'businesses'>('individuals');

  // Filter users based on role
  const individuals = users.filter((u) => u.role !== 'provider');
  const businesses = users.filter((u) => u.role === 'provider');

  return (
    <div className="space-y-6">
      {/* Segmented Control / Sub-tabs Switcher */}
      <div className="inline-flex p-1 bg-mist rounded-xl border border-[var(--line)]">
        <button
          onClick={() => setSubTab('individuals')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            subTab === 'individuals'
              ? 'bg-white text-ink shadow-sm'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          <UsersIcon size={14} />
          Individuals ({individuals.length})
        </button>
        <button
          onClick={() => setSubTab('businesses')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            subTab === 'businesses'
              ? 'bg-white text-ink shadow-sm'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          <Store size={14} />
          Businesses ({businesses.length})
        </button>
      </div>

      {/* Panels */}
      {subTab === 'individuals' ? (
        <div className="mist-panel overflow-hidden border border-[var(--line)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                  <th className="p-4">User Details</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Created At</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
                {individuals.map((usr) => (
                  <tr key={usr.id} className="hover:bg-mist/40 transition-colors">
                    {/* User Details */}
                    <td className="p-4">
                      <div className="font-bold">{usr.name}</div>
                      <div className="text-xs text-ink-soft mt-0.5">{usr.phone}</div>
                    </td>

                    {/* Role tags */}
                    <td className="p-4 capitalize">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        usr.role === 'admin' ? 'bg-flag/10 text-flag' : 'bg-mist text-ink-soft'
                      }`}>
                        {usr.role === 'tourist' ? 'tourist / traveller' : usr.role}
                      </span>
                    </td>

                    {/* Creation Timestamp */}
                    <td className="p-4 text-xs text-ink-soft">
                      {usr.createdAt ? new Date(usr.createdAt).toLocaleDateString() : 'N/A'}
                    </td>

                    {/* Actions column */}
                    <td className="p-4">
                      <div className="flex items-center justify-center">
                        {/* Admins cannot delete other admin accounts */}
                        {usr.role !== 'admin' && (
                          <button
                            onClick={() => onDeleteUser(usr.id, usr.name)}
                            className="p-1.5 rounded-lg border border-flag/30 text-flag hover:bg-flag/5 transition-all cursor-pointer"
                            title="Delete User"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {individuals.length === 0 && (
              <div className="p-8 text-center text-ink-soft">No individual users found.</div>
            )}
          </div>
        </div>
      ) : (
        <div className="mist-panel overflow-hidden border border-[var(--line)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                  <th className="p-4">Contact Details</th>
                  <th className="p-4">Business Profile</th>
                  <th className="p-4">Created At</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
                {businesses.map((usr) => (
                  <tr key={usr.id} className="hover:bg-mist/40 transition-colors">
                    {/* Contact Details */}
                    <td className="p-4">
                      <div className="font-bold">{usr.name}</div>
                      <div className="text-xs text-ink-soft mt-0.5">{usr.phone}</div>
                    </td>

                    {/* Business Name / Status */}
                    <td className="p-4">
                      <div>
                        <div className="font-bold text-ink">{usr.businessName || 'No Business Profile'}</div>
                        {usr.providerId && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${usr.providerStatus === 'active' ? 'bg-pine' : 'bg-gold'}`} />
                            <span className="text-[11px] font-bold uppercase text-ink-soft">{usr.providerStatus}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Creation Timestamp */}
                    <td className="p-4 text-xs text-ink-soft">
                      {usr.createdAt ? new Date(usr.createdAt).toLocaleDateString() : 'N/A'}
                    </td>

                    {/* Actions column */}
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Approve or Suspend status for Providers */}
                        {usr.providerId && (
                          <button
                            onClick={() => onToggleProviderStatus(usr.providerId, usr.providerStatus)}
                            className={`p-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                              usr.providerStatus === 'active' 
                                ? 'border-gold/30 text-gold hover:bg-gold/5' 
                                : 'border-pine/30 text-pine hover:bg-pine/5'
                            }`}
                            title={usr.providerStatus === 'active' ? 'Suspend Provider' : 'Approve Provider'}
                          >
                            {usr.providerStatus === 'active' ? <X size={14} /> : <Check size={14} />}
                          </button>
                        )}
                        
                        <button
                          onClick={() => onDeleteUser(usr.id, usr.name)}
                          className="p-1.5 rounded-lg border border-flag/30 text-flag hover:bg-flag/5 transition-all cursor-pointer"
                          title="Delete Business Account"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {businesses.length === 0 && (
              <div className="p-8 text-center text-ink-soft">No business accounts found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
