import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Preferences slice — persisted via localStorage.
 *
 * Subphase 1 owns:
 *   - `hasSeenWelcomeSplash` — gates the once-per-visitor WelcomeSplash that
 *      lands in Step 9.
 *
 * Subphase 2+ extends this with reading preferences (font size, view density)
 * once those features land.
 */
interface PreferencesState {
  hasSeenWelcomeSplash: boolean;
  markWelcomeSplashSeen: () => void;
  resetWelcomeSplash: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      hasSeenWelcomeSplash: false,
      markWelcomeSplashSeen: () => set({ hasSeenWelcomeSplash: true }),
      resetWelcomeSplash: () => set({ hasSeenWelcomeSplash: false }),
    }),
    {
      name: 'infimit-preferences',
      version: 1,
    },
  ),
);
