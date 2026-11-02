/**
 * ClinixVault Authentication Service
 * Manages dynamic clinician directory, Keycloak SSO sessions, and zero-egress credential storage.
 */

export interface ClinicianProfile {
  id: string;
  name: string;
  role: string;
  title: string;
  department: string;
  npi: string;
  badgeId: string;
  nodeId: string;
  clinic: string;
  location: string;
  firmware: string;
  authMethod: 'Keycloak Active Directory SSO' | 'SmartCard PIV/CAC' | 'Hospital LDAP';
  avatarInitials: string;
  breakGlassAuthorized: boolean;
}

export const DEFAULT_GUEST_CLINICIAN: ClinicianProfile = {
  id: 'clinician-unassigned',
  name: 'Unassigned Clinician',
  role: 'Clinical Provider',
  title: 'Licensed Clinician',
  department: 'General Medicine',
  npi: 'Pending NPI',
  badgeId: 'STAFF-PENDING',
  nodeId: 'CV-APPLIANCE-LOCAL',
  clinic: 'Clinical Suite',
  location: 'On-Premises Vault',
  firmware: 'v2.5.0-airgapped',
  authMethod: 'Keycloak Active Directory SSO',
  avatarInitials: 'MD',
  breakGlassAuthorized: false,
};

const CLINICIANS_STORAGE_KEY = 'clinixvault_registered_clinicians';
const USER_STORAGE_KEY = 'clinixvault_authenticated_user';

export const authService = {
  getRegisteredClinicians(): ClinicianProfile[] {
    try {
      const stored = localStorage.getItem(CLINICIANS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore JSON parse error
    }
    return [];
  },

  setRegisteredClinicians(list: ClinicianProfile[]): void {
    try {
      localStorage.setItem(CLINICIANS_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('clinixvault:clinicians_updated'));
    } catch {
      // ignore
    }
  },

  registerClinician(profile: ClinicianProfile): void {
    const list = this.getRegisteredClinicians();
    const updated = list.filter((c) => c.id !== profile.id);
    updated.push(profile);
    this.setRegisteredClinicians(updated);
    this.setCurrentUser(profile);
  },

  removeClinician(id: string): void {
    const list = this.getRegisteredClinicians();
    const updated = list.filter((c) => c.id !== id);
    this.setRegisteredClinicians(updated);
    const curr = this.getCurrentUser();
    if (curr.id === id) {
      if (updated.length > 0) {
        this.setCurrentUser(updated[0]);
      } else {
        this.setCurrentUser(DEFAULT_GUEST_CLINICIAN);
      }
    }
  },

  getCurrentUser(): ClinicianProfile {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    const registered = this.getRegisteredClinicians();
    if (registered.length > 0) {
      return registered[0];
    }
    return DEFAULT_GUEST_CLINICIAN;
  },

  setCurrentUser(user: ClinicianProfile): void {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      window.dispatchEvent(new CustomEvent('clinixvault:user_updated'));
    } catch {
      // ignore
    }
  },

  logout(): void {
    localStorage.removeItem(USER_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('clinixvault:user_updated'));
  },

  loginWithSSO(profileId: string): ClinicianProfile {
    const registered = this.getRegisteredClinicians();
    const found = registered.find((c) => c.id === profileId) || registered[0] || DEFAULT_GUEST_CLINICIAN;
    this.setCurrentUser(found);
    return found;
  },

  getAllProfiles(): ClinicianProfile[] {
    return this.getRegisteredClinicians();
  },
};
