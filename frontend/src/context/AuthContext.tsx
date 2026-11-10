import React, { useState, useEffect, useCallback } from 'react';
import { ClinicianProfile, DEFAULT_GUEST_CLINICIAN, authService } from '../services/authService';
import { AuthContext } from './authContextDefinition';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<ClinicianProfile>(() => authService.getCurrentUser());
  const [availableUsers, setAvailableUsers] = useState<ClinicianProfile[]>(() => authService.getRegisteredClinicians());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  const refreshUsers = useCallback(() => {
    const list = authService.getRegisteredClinicians();
    setAvailableUsers(list);
    const curr = authService.getCurrentUser();
    setCurrentUser(curr);
  }, []);

  useEffect(() => {
    void authService.syncFromDatabase().then(() => {
      refreshUsers();
    });
    window.addEventListener('clinixvault:clinicians_updated', refreshUsers);
    window.addEventListener('clinixvault:user_updated', refreshUsers);
    return () => {
      window.removeEventListener('clinixvault:clinicians_updated', refreshUsers);
      window.removeEventListener('clinixvault:user_updated', refreshUsers);
    };
  }, [refreshUsers]);

  const switchUser = (profileId: string) => {
    const updated = authService.loginWithSSO(profileId);
    setCurrentUser(updated);
  };

  const registerClinician = (profile: ClinicianProfile) => {
    authService.registerClinician(profile);
    refreshUsers();
  };

  const loginWithCredentials = (
    username: string,
    provider: string,
    role = 'Attending Physician',
    dept = 'Clinical Services',
    npi?: string
  ) => {
    const cleanName = username.trim() || 'Attending Physician';
    const matched = availableUsers.find(
      (c) => c.name.toLowerCase() === cleanName.toLowerCase() || c.id === cleanName.toLowerCase()
    );

    if (matched) {
      authService.setCurrentUser(matched);
      setCurrentUser(matched);
    } else {
      const initials = cleanName
        .split(' ')
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'MD';

      const custom: ClinicianProfile = {
        id: `user-${Date.now()}`,
        name: cleanName,
        role: role,
        title: role,
        department: dept,
        npi: npi?.trim() || `NPI-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        badgeId: `BADGE-${Math.floor(1000 + Math.random() * 9000)}`,
        nodeId: 'CV-APPLIANCE-LOCAL',
        clinic: `${dept} Unit`,
        location: 'On-Premises Air-Gapped Vault',
        firmware: 'v2.5.0-airgapped',
        authMethod: (provider as ClinicianProfile['authMethod']) || 'Keycloak Active Directory SSO',
        avatarInitials: initials,
        breakGlassAuthorized: true,
      };
      authService.registerClinician(custom);
      setCurrentUser(custom);
      refreshUsers();
    }
    setIsLoginModalOpen(false);
  };

  const logout = () => {
    authService.logout();
    const registered = authService.getRegisteredClinicians();
    setCurrentUser(registered[0] || DEFAULT_GUEST_CLINICIAN);
    setIsLoginModalOpen(true);
  };

  const openLoginModal = () => setIsLoginModalOpen(true);
  const closeLoginModal = () => setIsLoginModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        availableUsers,
        switchUser,
        loginWithCredentials,
        registerClinician,
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
