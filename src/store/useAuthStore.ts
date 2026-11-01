import { create } from 'zustand';
import { User } from '@supabase/supabase-js'; // Thay thế import từ firebase/auth

interface AuthState {
  firebaseUser: User | null; // Vẫn giữ tên biến này để không làm lỗi các component cũ đang gọi nó, dù giờ nó chứa data của Supabase
  user: any | null; // Backend user data (từ bảng users)
  isInitialized: boolean;
  setAuth: (firebaseUser: User | null, backendUser: any | null) => void;
  setInitialized: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  user: null,
  isInitialized: false,
  setAuth: (firebaseUser, backendUser) => set({ firebaseUser, user: backendUser }),
  setInitialized: (val) => set({ isInitialized: val }),
}));
