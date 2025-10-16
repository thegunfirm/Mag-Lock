import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Product, User } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

export interface CartItem {
  id: string;
  productId: number;
  productMPN: string;
  productName: string;
  productImage: string;
  quantity: number;
  price: number; // Current tier price - the actual price user pays
  priceBronze?: number; // For comparison display
  priceGold?: number; // For comparison display
  pricePlatinum?: number; // For comparison display
  requiresFFL: boolean;
  selectedFFL?: string;
  manufacturer: string;
  addedAt: string;
  fulfillmentType?: 'direct' | 'ffl_non_dropship' | 'ffl_dropship'; // Fulfillment path
  dropShippable?: boolean; // RSR field 69
}

interface AddToCartParams {
  productId: number;
  productMPN: string;
  productName: string;
  productImage: string;
  quantity: number;
  price: number; // Current tier price
  priceBronze?: number; // For comparison display
  priceGold?: number; // For comparison display
  pricePlatinum?: number; // For comparison display
  requiresFFL: boolean;
  selectedFFL?: string;
  manufacturer: string;
  dropShippable?: boolean; // RSR field 69
}

interface CartState {
  items: CartItem[];
  isLoading: boolean;
  isCartOpen: boolean;
  guestCartBackup: CartItem[]; // Backup for pre-login cart
  
  // Actions
  addItem: (params: AddToCartParams) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  syncWithServer: () => Promise<void>;
  setCartOpen: (isOpen: boolean) => void;
  mergeGuestCart: (user: User) => Promise<void>;
  loadUserCart: (user: User) => Promise<void>;
  clearOnLogout: () => void;
  forceRefreshFromServer: () => Promise<void>;
  
  // Computed properties
  getTotalPrice: () => number;
  getItemCount: () => number;
  hasFirearms: () => boolean;
  getFulfillmentGroups: () => Record<string, CartItem[]>;
  requiresFflSelection: () => boolean;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      isCartOpen: false,
      guestCartBackup: [],

      addItem: async (params: AddToCartParams) => {
        const currentItems = get().items;
        const existingItem = currentItems.find(item => 
          item.productId === params.productId && 
          item.productMPN === params.productMPN &&
          Math.abs(item.price - params.price) < 0.01 // Same price tier
        );

        if (existingItem) {
          // Update quantity
          await get().updateQuantity(existingItem.id, existingItem.quantity + params.quantity);
        } else {
          // Determine fulfillment type
          let fulfillmentType: 'direct' | 'ffl_non_dropship' | 'ffl_dropship' = 'direct';
          if (params.requiresFFL) {
            fulfillmentType = params.dropShippable ? 'ffl_dropship' : 'ffl_non_dropship';
          }

          // Add new item
          const newItem: CartItem = {
            id: `${params.productId}_${params.productMPN}_${Date.now()}`,
            productId: params.productId,
            productMPN: params.productMPN,
            productName: params.productName,
            productImage: params.productImage,
            quantity: params.quantity,
            price: params.price,
            priceBronze: params.priceBronze,
            priceGold: params.priceGold,
            pricePlatinum: params.pricePlatinum,
            requiresFFL: params.requiresFFL,
            selectedFFL: params.selectedFFL,
            manufacturer: params.manufacturer,
            addedAt: new Date().toISOString(),
            fulfillmentType,
            dropShippable: params.dropShippable,
          };

          set(state => ({
            items: [...state.items, newItem],
            isCartOpen: true, // Auto-open cart when item added
          }));

          // Sync with server
          await get().syncWithServer();
        }
      },

      removeItem: async (itemId: string) => {
        set(state => ({
          items: state.items.filter(item => item.id !== itemId)
        }));
        
        await get().syncWithServer();
      },

      updateQuantity: async (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          await get().removeItem(itemId);
          return;
        }

        set(state => ({
          items: state.items.map(item =>
            item.id === itemId ? { ...item, quantity } : item
          )
        }));

        await get().syncWithServer();
      },

      clearCart: async () => {
        set({ items: [], guestCartBackup: [] });
        // Also clear localStorage to prevent state corruption
        localStorage.removeItem('gun-firm-cart');
        await get().syncWithServer();
      },

      mergeGuestCart: async (user: User) => {
        const { items: guestItems } = get();
        
        if (guestItems.length === 0) {
          await get().loadUserCart(user);
          return;
        }

        try {
          set({ isLoading: true });
          
          // Backup guest cart
          set(state => ({ guestCartBackup: [...state.items] }));
          
          // Fetch user's existing cart from server
          const response = await fetch(`/api/cart/${user.id}`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          // Handle authentication errors
          if (response.status === 401 || response.status === 403) {
            console.info('User not authenticated or authorized for cart access - keeping guest cart');
            // Keep guest cart items as they are
            return;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const userCart = await response.json();
          
          // Merge carts avoiding duplicates
          const mergedItems = [...userCart.items];
          
          guestItems.forEach(guestItem => {
            const existingIndex = mergedItems.findIndex(item => 
              item.productId === guestItem.productId && 
              item.productMPN === guestItem.productMPN &&
              Math.abs(item.price - guestItem.price) < 0.01
            );
            
            if (existingIndex >= 0) {
              // Add quantities together, but cap at reasonable limit
              mergedItems[existingIndex].quantity = Math.min(
                10,
                mergedItems[existingIndex].quantity + guestItem.quantity
              );
            } else {
              // Add new item
              mergedItems.push(guestItem);
            }
          });
          
          set({ items: mergedItems });
          await get().syncWithServer();
          
        } catch (error) {
          console.error('Failed to merge guest cart:', error);
          // Keep guest cart on error
        } finally {
          set({ isLoading: false });
        }
      },

      loadUserCart: async (user: User) => {
        try {
          set({ isLoading: true });
          
          // Try to fetch user cart from server
          const response = await fetch(`/api/cart/${user.id}`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          // Handle authentication errors - don't load cart for unauthenticated users
          if (response.status === 401 || response.status === 403) {
            console.info('User not authenticated or authorized for cart access - using guest cart');
            // Don't try to load cart, just keep the guest cart
            return;
          }
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const userCart = await response.json();
          
          // Validate and filter items from server
          const validItems = (userCart.items || []).filter((item: any) => 
            item && 
            typeof item.quantity === 'number' && 
            item.quantity > 0 && 
            item.quantity <= 10 &&
            item.productId &&
            item.productMPN
          );
          
          // If server had corrupted data, sync the cleaned version back
          if (validItems.length !== (userCart.items || []).length) {
            console.warn(`Server had ${(userCart.items || []).length - validItems.length} corrupted items, cleaning up`);
            await apiRequest('POST', '/api/cart/sync', { items: validItems });
          }
          
          set({ items: validItems });
          
        } catch (error: any) {
          // Only log errors that aren't auth-related
          if (!error.message?.includes('401') && !error.message?.includes('403')) {
            console.error('Failed to load user cart:', error);
          }
        } finally {
          set({ isLoading: false });
        }
      },

      clearOnLogout: () => {
        set({ items: [], guestCartBackup: [], isCartOpen: false });
        // Clear localStorage to prevent corruption
        localStorage.removeItem('gun-firm-cart');
      },

      // Force refresh cart from server - useful for fixing corrupted state
      forceRefreshFromServer: async () => {
        try {
          set({ isLoading: true });
          
          // Clear localStorage completely
          localStorage.removeItem('gun-firm-cart');
          
          // Clear server cart first
          await apiRequest('POST', '/api/cart/sync', { items: [] });
          
          // Reset local state
          set({ items: [], guestCartBackup: [] });
          
        } catch (error) {
          console.error('Failed to force refresh cart:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      syncWithServer: async () => {
        try {
          set({ isLoading: true });
          
          const { items } = get();
          
          // Validate items before syncing to prevent corruption
          const validItems = items.filter(item => 
            item && 
            typeof item.quantity === 'number' && 
            item.quantity > 0 && 
            item.quantity <= 10 &&
            item.productId &&
            item.productMPN
          );
          
          // If items were filtered out due to corruption, update local state
          if (validItems.length !== items.length) {
            console.warn(`Filtered out ${items.length - validItems.length} corrupted cart items`);
            set({ items: validItems });
          }
          
          await apiRequest('POST', '/api/cart/sync', { items: validItems });
          
        } catch (error) {
          console.error('Failed to sync cart with server:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      setCartOpen: (isOpen: boolean) => {
        set({ isCartOpen: isOpen });
      },

      getTotalPrice: () => {
        const { items } = get();
        return items.reduce((total, item) => {
          const itemPrice = typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0;
          const itemQuantity = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0;
          return total + (itemPrice * itemQuantity);
        }, 0);
      },

      getItemCount: () => {
        const { items } = get();
        return items.reduce((total, item) => total + item.quantity, 0);
      },

      hasFirearms: () => {
        const { items } = get();
        return items.some(item => item.requiresFFL);
      },

      getFulfillmentGroups: () => {
        const { items } = get();
        const groups: Record<string, CartItem[]> = {
          direct: [],
          ffl_non_dropship: [],
          ffl_dropship: []
        };
        
        items.forEach(item => {
          const type = item.fulfillmentType || 'direct';
          groups[type].push(item);
        });
        
        return groups;
      },

      requiresFflSelection: () => {
        const { items } = get();
        return items.some(item => item.requiresFFL && !item.selectedFFL);
      }
    }),
    {
      name: 'gun-firm-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        guestCartBackup: state.guestCartBackup,
        // Don't persist loading states or cart open state
      }),
    }
  )
);