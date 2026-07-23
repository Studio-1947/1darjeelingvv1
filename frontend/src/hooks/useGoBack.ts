import { useNavigate } from 'react-router-dom';

/**
 * Back navigation that stays safe on a cold start. When the app was opened
 * directly on a deep link there is no history entry to pop, so nav(-1) would
 * leave the site; fall back to the given route instead.
 */
export default function useGoBack(fallback = '/') {
  const nav = useNavigate();

  return () => {
    if (window.history.state && window.history.state.idx > 0) {
      nav(-1);
    } else {
      nav(fallback);
    }
  };
}
