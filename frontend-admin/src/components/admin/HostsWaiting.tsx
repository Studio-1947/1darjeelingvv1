import { useCallback, useEffect, useState } from 'react';
import { Loader2, Phone, MessageCircle, RefreshCw, UserCheck } from 'lucide-react';
import api from '@/lib/api';

interface WaitingHost {
  provider_id: string;
  business_name: string;
  business_type: string;
  owner_name: string | null;
  phone: string | null;
  plan_status: string;
  kyc_status: string;
  created_at: string;
  next_step: string;
  /** Mandatory profile items still missing (lib/hostProfile.ts missingMandatory). */
  profile_missing: ({ key: string; label: string } | string)[];
  documents: { doc_type: string; label: string; required: boolean; state: string }[];
  profile_left: { key: string; label: string }[];
}

/** Each step: what it means, whose turn it is, and the nudge to send the host. */
const STEPS: Record<string, { label: string; team: boolean; cls: string; nudge?: string }> = {
  review_documents: { label: 'Your turn: review documents', team: true, cls: 'bg-pine/10 text-pine' },
  pay_plan: { label: 'Plan not paid', team: false, cls: 'bg-gold/15 text-gold-dark', nudge: 'your aangan host plan is not paid yet. Open your dashboard on aanganerp.in to activate it.' },
  finish_profile: { label: 'Profile incomplete', team: false, cls: 'bg-gold/15 text-gold-dark', nudge: 'a few profile items are still missing on aangan, so you cannot send your documents yet:' },
  upload_documents: { label: 'Documents not sent', team: false, cls: 'bg-gold/15 text-gold-dark', nudge: 'please upload these documents on your aangan dashboard so we can verify you:' },
  fix_rejected: { label: 'Re-upload a rejected document', team: false, cls: 'bg-flag/10 text-flag', nudge: 'one of your documents needs to be uploaded again on aangan:' },
  verify_location: { label: 'Location check not done', team: false, cls: 'bg-gold/15 text-gold-dark', nudge: 'please confirm your location on your aangan dashboard (Documents tab). It is the last step before you go live.' },
};

/** What is still missing for this host, in words, for the row and the WhatsApp nudge. */
function missingItems(h: WaitingHost): string[] {
  if (h.next_step === 'finish_profile') {
    return h.profile_missing.length
      ? h.profile_missing.map((m) => (typeof m === 'string' ? m : m.label))
      : h.profile_left.map((p) => p.label);
  }
  if (h.next_step === 'upload_documents') return h.documents.filter((d) => d.required && d.state === 'missing').map((d) => d.label);
  if (h.next_step === 'fix_rejected') return h.documents.filter((d) => d.required && d.state === 'rejected').map((d) => d.label);
  if (h.next_step === 'review_documents') return h.documents.filter((d) => d.state === 'in_review').map((d) => d.label);
  return [];
}

function waLink(h: WaitingHost): string | null {
  const step = STEPS[h.next_step];
  if (!h.phone || !step?.nudge) return null;
  const items = missingItems(h);
  const text = `Hi ${h.owner_name || h.business_name}, this is the aangan team. For ${h.business_name}, ${step.nudge}${items.length ? '\n- ' + items.join('\n- ') : ''}\nReply here if you need help.`;
  return `https://wa.me/${h.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

/**
 * Hosts who are not live yet, and the one step holding each of them up. Before this, a host with
 * every document approved could still be invisible (missing photos, no location check) and nothing
 * on this page said why.
 */
export default function HostsWaiting() {
  const [hosts, setHosts] = useState<WaitingHost[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/hosts/waiting');
      setHosts(data.hosts || []);
      setCounts(data.counts || {});
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load the hosts waiting to go live.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The team's turn first, then the hosts who need a nudge.
  const sorted = [...hosts].sort((a, b) => Number(STEPS[b.next_step]?.team) - Number(STEPS[a.next_step]?.team));

  return (
    <section className="mist-panel p-4 md:p-6 mb-6" data-testid="hosts-waiting">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display font-extrabold text-xl text-ink flex items-center gap-2"><UserCheck size={18} /> Hosts not live yet</h2>
          <p className="text-sm text-ink-soft">
            {hosts.length} waiting{counts.review_documents ? ` · ${counts.review_documents} need your review` : ''}. Everyone else has a step to finish; send them a nudge.
          </p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-bold text-ink hover:bg-mist">
          <RefreshCw size={13} /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="py-6 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={18} /></div>
      ) : error ? (
        <p className="text-sm text-flag">{error}</p>
      ) : hosts.length === 0 ? (
        <p className="text-sm text-ink-soft py-4 text-center">Every host is live.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((h) => {
            const step = STEPS[h.next_step] || { label: h.next_step, team: false, cls: 'bg-mist text-ink-soft' };
            const items = missingItems(h);
            const wa = waLink(h);
            return (
              <div key={h.provider_id} className="border border-[var(--line)] rounded-xl p-4 flex flex-wrap items-start justify-between gap-3" data-testid={`waiting-host-${h.provider_id}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">{h.business_name}</span>
                    <span className="text-xs text-ink-soft capitalize">· {h.business_type}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${step.cls}`} data-testid={`waiting-step-${h.provider_id}`}>{step.label}</span>
                  </div>
                  <div className="text-sm text-ink-soft">{h.owner_name || 'Unknown owner'} · joined {new Date(h.created_at).toLocaleDateString()}</div>
                  {items.length > 0 && (
                    <ul className="mt-1.5 text-xs text-ink list-disc pl-4 space-y-0.5">
                      {items.map((i, idx) => <li key={`${idx}-${i}`}>{i}</li>)}
                    </ul>
                  )}
                </div>
                <div className="flex gap-2">
                  {h.phone && (
                    <a href={`tel:${h.phone}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-bold text-ink hover:bg-mist">
                      <Phone size={13} /> {h.phone}
                    </a>
                  )}
                  {wa && (
                    <a href={wa} target="_blank" rel="noreferrer" data-testid={`waiting-nudge-${h.provider_id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold btn-hover">
                      <MessageCircle size={13} /> Nudge on WhatsApp
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
