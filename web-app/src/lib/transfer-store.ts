import { create } from 'zustand';

export type TransferTab = 'to' | 'from' | 'automatic' | 'between';

interface TransferProgress {
  current: number;
  total: number;
  currentItem?: string;
}

interface TransferState {
  activeTab: TransferTab;
  setActiveTab: (tab: TransferTab) => void;

  sourceUnit: string | null;
  setSourceUnit: (id: string | null) => void;

  targetUnit: string | null;
  setTargetUnit: (id: string | null) => void;

  selectedItems: Set<string>;
  toggleItem: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;

  isTransferring: boolean;
  progress: TransferProgress | null;
  setTransferring: (active: boolean, progress?: TransferProgress | null) => void;
  updateProgress: (progress: TransferProgress) => void;

  // Fastmove
  fastmove: boolean;
  toggleFastmove: () => void;
  queue: string[];
  addToQueue: (id: string) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  processingItem: string | null;
  setProcessingItem: (id: string | null) => void;
  movedItems: Set<string>;
  addMovedItem: (id: string) => void;
  clearMovedItems: () => void;
}

export const useTransferStore = create<TransferState>((set) => ({
  activeTab: 'to',
  setActiveTab: (tab) => set({ activeTab: tab, selectedItems: new Set(), sourceUnit: null, targetUnit: null, queue: [], processingItem: null, movedItems: new Set() }),

  sourceUnit: null,
  setSourceUnit: (id) => set({ sourceUnit: id, selectedItems: new Set(), queue: [], processingItem: null, movedItems: new Set() }),

  targetUnit: null,
  setTargetUnit: (id) => set({ targetUnit: id }),

  selectedItems: new Set(),
  toggleItem: (id) =>
    set((state) => {
      const next = new Set(state.selectedItems);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedItems: next };
    }),
  selectAll: (ids) => set({ selectedItems: new Set(ids) }),
  clearSelection: () => set({ selectedItems: new Set() }),

  isTransferring: false,
  progress: null,
  setTransferring: (active, progress = null) => set({ isTransferring: active, progress }),
  updateProgress: (progress) => set({ progress }),

  // Fastmove
  fastmove: false,
  toggleFastmove: () => set((state) => ({ fastmove: !state.fastmove, selectedItems: new Set() })),
  queue: [],
  addToQueue: (id) => set((state) => {
    if (state.queue.includes(id) || state.movedItems.has(id)) return state;
    return { queue: [...state.queue, id] };
  }),
  removeFromQueue: (id) => set((state) => ({ queue: state.queue.filter((i) => i !== id) })),
  clearQueue: () => set({ queue: [], processingItem: null }),
  processingItem: null,
  setProcessingItem: (id) => set({ processingItem: id }),
  movedItems: new Set(),
  addMovedItem: (id) => set((state) => {
    const next = new Set(state.movedItems);
    next.add(id);
    return { movedItems: next };
  }),
  clearMovedItems: () => set({ movedItems: new Set() }),
}));
