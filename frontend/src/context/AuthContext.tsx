import React, { useState, useEffect } from 'react';
import { ClinicianProfile, PRECONFIGURED_CLINICIANS, authService } from '../services/authService';
import { AuthContext } from './authContextDefinition';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<ClinicianProfile>(() => authService.getCurrentUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  useEffect(() => {
    authService.setCurrentUser(currentUser);
  }, [currentUser]);

  const switchUser = (profileId: string) => {
    const updated = authService.loginWithSSO(profileId);
    setCurrentUser(updated);
  };

  const loginWithCredentials = (username: string, provider: string) => {
    // Look for matching or fallback to Dr. Amanda Chen customized
    const matched = PRECONFIGURED_CLINICIANS.find(
      (c) => c.name.toLowerCase().includes(username.toLowerCase()) || c.id.includes(username.toLowerCase())
    );
    if (matched) {
      setCurrentUser(matched);
    } else {
      const custom: ClinicianProfile = {
        id: `user-${Date.now()}`,
        name: username || 'Dr. Amanda Chen, MD, CMIO',
        role: 'Attending Clinician',
        title: 'Licensed Clinical Provider',
        department: 'Internal Medicine Suite',
        npi: 'NPI-1948201948',
        badgeId: 'STAFF-EXT-01',
        nodeId: 'CV-APPLIANCE-WEST-09',
        clinic: 'Internal Medicine Suite',
        location: 'Air-Gapped Vault #4 • Room 204',
        firmware: 'v2.4.1-airgapped-prod',
        authMethod: (provider as ClinicianProfile['authMethod']) || 'Keycloak Active Directory SSO',
        avatarInitials: (username.slice(0, 2) || 'MD').toUpperCase(),
        breakGlassAuthorized: true,
      };
      setCurrentUser(custom);
    }
    setIsLoginModalOpen(false);
  };

  const logout = () => {
    authService.logout();
    const defaultUser = PRECONFIGURED_CLINICIANS[0];
    setCurrentUser(defaultUser);
    setIsLoginModalOpen(true);
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        availableUsers: PRECONFIGURED_CLINICIANS,
        switchUser,
        loginWithCredentials,
        logout,
        isLoginModalOpen,
        openLoginModal,
        closeLoginModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
