import React from 'react';
import { BUSINESS_TYPES } from '@/constants/listingOptions';
import { OnboardState } from './useProviderOnboard';

/** Step 1 — business name and type. */
export default function BasicInfoStep({ o }: { o: OnboardState }) {
  const { form, update, msg, startDesignStep } = o;
  return (
    <div className="mx-auto max-w-md px-4 py-16 md:py-24">
      <div className="text-center mb-8">
        <span className="chip">₹99 · One-time fee</span>
        <h1 className="mt-3 font-display font-extrabold text-3xl text-ink">List Your Business</h1>
        <p className="mt-2 text-sm text-ink-soft">Get started by entering your basic business details.</p>
      </div>

      <div className="mist-panel p-6 space-y-5">
        <label className="block">
          <span className="text-xs font-semibold text-ink-soft">Business Name</span>
          <input
            required
            value={form.business_name}
            onChange={(e) => update({ business_name: e.target.value })}
            placeholder="e.g. Pine Breeze Homestay"
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none font-semibold text-sm text-ink"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold text-ink-soft">Business Type</span>
          <select
            value={form.business_type}
            onChange={(e) => update({ business_type: e.target.value })}
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none font-semibold text-sm text-ink capitalize"
          >
            {BUSINESS_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {tp}
              </option>
            ))}
          </select>
        </label>

        <button onClick={startDesignStep} className="w-full py-3 rounded-full bg-flag text-white font-bold btn-hover">
          Next: Update Profile
        </button>
        {msg && <p className="text-xs text-center text-flag font-semibold">{msg}</p>}
      </div>
    </div>
  );
}
