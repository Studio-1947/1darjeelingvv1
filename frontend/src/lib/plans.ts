import api from '@/lib/api';

/** Mirrors the limits in backend/src/routes/plans.ts. */
export const MAX_STOPS = 12;
export const MAX_NIGHTS = 30;
export const MAX_SEATS = 20;
export const MAX_TITLE_LEN = 120;

export type JoinStatus = 'pending' | 'accepted' | 'declined';
export type PlanPerson = { id: string; name: string; avatar: string | null };
export type PlanListing = { id: string; title: string; type: string; location: string; price: number; image: string };

export interface TripPlan {
  id: string;
  title: string;
  cover: string | null;
  stops: { place: string; note?: string }[];
  days: { day: number; text: string }[];
  start_date: string | null;
  nights: number;
  seats: number;
  cost_per_person: number | null;
  notes: string;
  visibility: 'public' | 'private';
  created_at: string;
  updated_at: string | null;
  organiser: PlanPerson;
  stay: PlanListing | null;
  driver: PlanListing | null;
  joined_count: number;
  seats_left: number;
  full: boolean;
  /** The organiser first, then accepted members (up to five). */
  members: PlanPerson[];
  viewer: { is_organiser: boolean; saved: boolean; join_status: JoinStatus | null } | null;
  /** Organiser (and team) only. */
  hidden?: boolean;
  pending_count?: number;
  requests?: { user: PlanPerson; status: JoinStatus; created_at: string }[];
}

export interface PlanInput {
  title: string;
  stops: { place: string; note?: string }[];
  days?: { day: number; text: string }[];
  start_date?: string | null;
  nights: number;
  seats: number;
  cost_per_person?: number | null;
  stay_listing_id?: string | null;
  driver_listing_id?: string | null;
  notes?: string;
  cover?: string | null;
  visibility?: 'public' | 'private';
}

export async function fetchPlans(opts: { before?: string | null; limit?: number } = {}) {
  const { data } = await api.get('/plans', { params: { before: opts.before || undefined, limit: opts.limit } });
  return { plans: (data.plans || []) as TripPlan[], nextBefore: (data.next_before || null) as string | null };
}

export async function fetchPlan(id: string): Promise<TripPlan> {
  const { data } = await api.get(`/plans/${encodeURIComponent(id)}`);
  return data.plan;
}

export async function fetchMyPlans(): Promise<{ mine: TripPlan[]; joined: TripPlan[]; saved: TripPlan[] }> {
  const { data } = await api.get('/plans/me');
  return { mine: data.mine || [], joined: data.joined || [], saved: data.saved || [] };
}

export async function createPlan(input: PlanInput): Promise<TripPlan> {
  const { data } = await api.post('/plans', input);
  return data.plan;
}

export async function updatePlan(id: string, input: Partial<PlanInput>): Promise<TripPlan> {
  const { data } = await api.patch(`/plans/${encodeURIComponent(id)}`, input);
  return data.plan;
}

export async function deletePlan(id: string): Promise<void> {
  await api.delete(`/plans/${encodeURIComponent(id)}`);
}

export async function askToJoin(id: string): Promise<TripPlan> {
  const { data } = await api.post(`/plans/${encodeURIComponent(id)}/join`);
  return data.plan;
}

export async function leavePlan(id: string): Promise<TripPlan | null> {
  const { data } = await api.delete(`/plans/${encodeURIComponent(id)}/join`);
  return data.plan ?? null;
}

export async function answerRequest(id: string, userId: string, action: 'accept' | 'decline'): Promise<TripPlan> {
  const { data } = await api.post(`/plans/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/${action}`);
  return data.plan;
}

export async function setPlanSaved(id: string, saved: boolean): Promise<void> {
  if (saved) await api.post(`/plans/${encodeURIComponent(id)}/save`);
  else await api.delete(`/plans/${encodeURIComponent(id)}/save`);
}

/** "12 Dec", as the prototype's cards write it. */
export function planDate(iso: string | null, lang = 'en-IN'): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
}

/** "Sat, 12 Dec" for day n (0-based) of a trip starting on iso. */
export function dayDate(iso: string | null, n: number, lang = 'en-IN'): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
}

export const rupees = (n: number | null | undefined) => `₹${Math.max(0, Math.round(n || 0)).toLocaleString('en-IN')}`;

/** The server's own words for a refused action, or the fallback. */
export const apiError = (e: any, fallback: string): string => e?.response?.data?.detail || fallback;

// ---------- the planner's arithmetic (prototype plans.js tpDays / tpSync / planCost) ----------

export type PlanDay = { place: string; text: string };
export type CostKey = 'stay' | 'car' | 'guide' | 'spots';
export type PlanDraftCosts = {
  nights: number;
  seats: number;
  stay: PlanListing | null;
  driver: PlanListing | null;
  /** Numbers the organiser typed over the estimate; '' or missing means use the estimate. */
  adj: Partial<Record<CostKey, string>>;
  extra: { name: string; amt: string }[];
};

/** One entry per day of the trip (nights + 1), each starting where the day before ended. */
export function fitDays(days: PlanDay[], nights: number): PlanDay[] {
  const n = Math.max(1, nights) + 1;
  const out = days.slice(0, n);
  while (out.length < n) out.push({ place: out.length ? out[out.length - 1].place : '', text: '' });
  return out;
}

/** The route: each place once, in the order the days reach it. */
export const stopsOf = (days: PlanDay[]) => [...new Set(days.map((d) => d.place).filter(Boolean))];

/** Estimate from listed prices: the stay per night, the car per day shared by the seats; typed numbers win. */
export function planCosts(d: PlanDraftCosts) {
  const seats = Math.max(1, d.seats);
  const auto: Record<CostKey, number> = {
    stay: d.stay ? (d.stay.price || 0) * d.nights : 0,
    car: d.driver ? Math.round(((d.driver.price || 0) * (d.nights + 1)) / seats) : 0,
    guide: 0,
    spots: 0,
  };
  const val = { ...auto };
  (Object.keys(val) as CostKey[]).forEach((k) => {
    const a = d.adj[k];
    if (a != null && a !== '') val[k] = Math.max(0, Math.round(Number(a) || 0));
  });
  const extra = d.extra.reduce((t, e) => t + Math.max(0, Math.round(Number(e.amt) || 0)), 0);
  return { auto, val, total: val.stay + val.car + val.guide + val.spots + extra };
}
