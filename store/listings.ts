import { create } from "zustand";
import { ListingCard } from "@/lib/types";

interface ListingsStore {
  listings: ListingCard[];
  isLoading: boolean;
  error: string | null;
  addListing: (listing: ListingCard) => void;
  setListings: (listings: ListingCard[]) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useListingsStore = create<ListingsStore>((set) => ({
  listings: [],
  isLoading: false,
  error: null,
  addListing: (listing) =>
    set((state) => ({ listings: [listing, ...state.listings] })),
  setListings: (listings) => set({ listings }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
