import { createContext } from 'react';
import { ClinicianProfile } from '../services/authService';

export interface AuthContextType {
  currentUser: ClinicianProfile;
  availableUsers: ClinicianProfile[];
  switchUser: (profileId: string) => void;
  loginWithCredentials: (username: string, provider: string) => void;
  logout: () => void;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
