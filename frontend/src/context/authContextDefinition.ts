import { createContext } from 'react';
import { ClinicianProfile } from '../services/authService';

export interface AuthContextType {
  currentUser: ClinicianProfile;
  availableUsers: ClinicianProfile[];
  switchUser: (profileId: string) => void;
  loginWithCredentials: (username: string, provider: string, role?: string, dept?: string, npi?: string) => void;
  registerClinician: (profile: ClinicianProfile) => void;
  logout: () => void;
  isLoginModalOpen: boolean;
  openLoginModal: () => void;
  closeLoginModal: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
