import { create } from 'zustand';

/**
 * UI state slice — ephemeral, app-wide UI state (overlay visibility, etc.).
 * Persistence belongs in `preferences-store` instead.
 *
 * Subphase 1 owns: the mobile/tablet sidebar drawer's open state. Header
 * triggers `openSidebar`; Sidebar consumes `isSidebarOpen` + `closeSidebar`.
 */
interface UIState {
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false,
  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
}));
