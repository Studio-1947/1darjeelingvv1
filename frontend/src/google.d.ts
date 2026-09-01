/**
 * Type declarations for Google Identity Services (GIS).
 * Loaded dynamically via <script src="https://accounts.google.com/gsi/client">.
 */
interface GoogleAccounts {
  id: {
    initialize(config: {
      client_id: string;
      callback: (response: { credential: string }) => void;
      auto_select?: boolean;
      cancel_on_tap_outside?: boolean;
    }): void;
    prompt(): void;
    revoke(sessionId: string, callback: () => void): void;
  };
}

interface Window {
  google?: {
    accounts: GoogleAccounts;
  };
}
