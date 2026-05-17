import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChannelStore {
  selectedChannelId: string | null;
  setSelectedChannelId: (id: string) => void;
}

export const useChannelStore = create<ChannelStore>()(
  persist(
    (set) => ({
      selectedChannelId: null,
      setSelectedChannelId: (id) => set({ selectedChannelId: id }),
    }),
    { name: 'channel-store' },
  ),
);
