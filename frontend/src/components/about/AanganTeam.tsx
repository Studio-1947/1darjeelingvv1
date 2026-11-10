import React from 'react';
import { TEAM, type TeamMember } from './teamData';
import './AanganTeam.css';

type CropStyle = React.CSSProperties & { '--x'?: string; '--y'?: string; '--z'?: number; '--i'?: number };

const ArrowIcon = ({ size }: { size: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Renders *emphasis* inside a bio paragraph. */
function withEmphasis(text: string) {
  return text.split(/(\*[^*]+\*)/g).map((part, i) =>
    part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em> : part,
  );
}

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * "The people behind aangan": a grid of portrait cards, each opening a
 * profile dialog. Mirrors the team section on the Studio 1947 product page.
 */
export default function AanganTeam({ title, intro }: { title: string; intro: string }) {
  const sectionRef = React.useRef<HTMLElement>(null);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [inView, setInView] = React.useState(false);
  const [open, setOpen] = React.useState<TeamMember | null>(null);
  const [hasMore, setHasMore] = React.useState(false);

  // Cards rise in, staggered, the first time the grid scrolls into view.
  React.useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Fade at the bottom of the dialog while there is more bio to scroll to.
  const updateMore = React.useCallback(() => {
    const p = panelRef.current;
    setHasMore(!!p && p.scrollHeight - p.scrollTop - p.clientHeight > 4);
  }, []);

  const show = (m: TeamMember) => {
    setOpen(m);
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  };
  const close = () => dialogRef.current?.close();

  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(updateMore);
  }, [open, updateMore]);

  return (
    <section ref={sectionRef} className={`team${inView ? ' is-in' : ''}`} aria-labelledby="aangan-team-title" data-testid="about-team">
      <div className="team__inner">
        <header className="team__head">
          <h2 id="aangan-team-title" className="team__heading">{title}</h2>
          <p className="team__intro">{intro}</p>
        </header>

        <ul className="team__grid" data-testid="mobile-team-grid">
          {TEAM.map((m, i) => (
            <li key={m.slug} className="team__card" style={{ '--i': i } as CropStyle}>
              <button
                type="button"
                className="team__link"
                aria-label={`${m.name}, ${m.role}: view details`}
                aria-haspopup="dialog"
                onClick={() => show(m)}
              >
                <img
                  className="team__photo"
                  src={m.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ '--z': m.crop.z, '--x': m.crop.x, '--y': m.crop.y } as CropStyle}
                />
                <span className="team__meta">
                  <span className="team__role">{m.role}</span>
                  <span className="team__name">{m.name}</span>
                </span>
                <span className="team__arrow" aria-hidden>
                  <ArrowIcon size={15} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <dialog
        ref={dialogRef}
        className={`team__dialog${hasMore ? ' has-more' : ''}`}
        aria-labelledby="team-dialog-name"
        onClose={() => setOpen(null)}
        // A click on the backdrop lands on the dialog element itself.
        onClick={e => { if (e.target === e.currentTarget) close(); }}
      >
        <button type="button" className="team__close" aria-label="Close" onClick={close}>
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div ref={panelRef} className="team__panel" onScroll={updateMore}>
          {open && (
            <>
              <div className="team__person">
                <img
                  className="team__portrait"
                  src={open.image}
                  alt={`Portrait of ${open.name}`}
                  style={{ '--x': open.crop.x, '--y': open.crop.y } as CropStyle}
                />
                <div>
                  <p className="team__person-role">{open.role}</p>
                  <h3 className="team__person-name" id="team-dialog-name">{open.fullName}</h3>
                  <p className="team__person-at">{open.at}</p>
                </div>
              </div>

              <div className="team__block">
                <h4>Work area</h4>
                <p>{open.workArea}</p>
              </div>

              <div className="team__bio">
                {open.lead && <p className="team-bio__lead">{open.lead}</p>}
                {open.bio.map((para, i) => <p key={i}>{withEmphasis(para)}</p>)}
                {open.links?.map(l => (
                  <p key={l.href}><a href={l.href} {...ext}>{l.label}</a></p>
                ))}
              </div>
            </>
          )}
        </div>
      </dialog>
    </section>
  );
}
