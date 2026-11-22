/**
 * The legal entity behind aangan / 1Darjeeling, shown in the footer and on the policy pages
 * (Consumer Protection (E-Commerce) Rules, 2020: name, GSTIN and a named grievance officer).
 *
 * The GSTIN and the officer's name are left empty until the owner supplies them; while a field is
 * empty its line is simply not shown, so nothing half-filled appears on the site.
 */
export const COMPANY = {
  legalName: 'WBIN 1947 Studio LLP',
  gstin: '',
  grievanceOfficer: '',
  /** The officer's designation (e.g. 'Designated Partner'), shown after the name; the rules ask for both. */
  grievanceDesignation: '',
  /**
   * The one support / grievance / data-request address. Every page reads it from here, including
   * the policy texts' contact cards ({{email}} in the locale files). The review asked for an address
   * on our own domain instead of Gmail: change it here once that mailbox exists.
   */
  email: 'aanganerp@gmail.com',
};
