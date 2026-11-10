/**
 * ClinixVault Authentication Service
 * Manages database-backed clinician directory, Keycloak SSO sessions, and zero-egress credential storage.
 */

import { clinixApi } from './api';

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
  id: 'clinician-marcus-vance',
  name: 'Dr. Marcus Vance',
  role: 'Attending Radiologist',
  title: 'Lead Radiologist',
  department: 'Diagnostic Radiology',
  npi: 'NPI-1942084920',
  badgeId: 'STAFF-MV-01',
  nodeId: 'CV-APPLIANCE-LOCAL',
  clinic: 'Radiology Suite 4',
  location: 'On-Premises Vault',
  firmware: 'v2.5.0-airgapped',
  authMethod: 'Keycloak Active Directory SSO',
  avatarInitials: 'MV',
  breakGlassAuthorized: true,
};

const CLINICIANS_STORAGE_KEY = 'clinixvault_registered_clinicians';
const USER_STORAGE_KEY = 'clinixvault_authenticated_user';

function extractInitials(name: string): string {
  return (name || 'MD')
    .split(' ')
    .filter((p: string) => !['Dr.', 'MD,', 'RN,', 'MS,', 'BSN,', 'CISSP', 'CMIO'].includes(p))
    .slice(0, 2)
    .map((n: string) => n[0])
    .join('')
    .toUpperCase() || 'MD';
}

export const authService = {
  /**
   * Sync clinicians directly from the backend database (SQLite / PostgreSQL)
   */
  async syncFromDatabase(): Promise<ClinicianProfile[]> {
    try {
      const dbClinicians = await clinixApi.getClinicians();
      if (Array.isArray(dbClinicians) && dbClinicians.length > 0) {
        const mapped: ClinicianProfile[] = dbClinicians
          .filter((c: any) => c && c.name && !c.name.includes('Dr. Amanda Chen'))
          .map((c: any) => ({
            id: c.id,
            name: c.name,
            role: c.role || 'Attending Physician',
            title: c.title || 'Licensed Clinician',
            department: c.department || 'Internal Medicine',
            npi: c.npi || `NPI-1000000000`,
            badgeId: c.badge_id || `BADGE-${c.id}`,
            nodeId: c.assigned_node || 'CV-APPLIANCE-LOCAL',
            clinic: c.department || 'Clinical Suite',
            location: 'On-Premises Vault',
            firmware: 'v2.5.0-airgapped',
            authMethod: c.auth_method || 'Keycloak Active Directory SSO',
            avatarInitials: c.avatar_initials || extractInitials(c.name),
            breakGlassAuthorized: Boolean(c.break_glass_authorized),
          }));

        if (mapped.length > 0) {
          this.setRegisteredClinicians(mapped);

          // Check if an active clinician was returned
          const active = dbClinicians.find((c: any) => c.is_active);
          if (active) {
            const activeProfile = mapped.find((p) => p.id === active.id) || mapped[0];
            this.setCurrentUser(activeProfile);
          }
          return mapped;
        }
      }
    } catch {
      // Offline fallback: rely on local cache
    }
    return this.getRegisteredClinicians();
  },

  getRegisteredClinicians(): ClinicianProfile[] {
    const profiles: ClinicianProfile[] = [];
    try {
      const stored = localStorage.getItem(CLINICIANS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          profiles.push(...parsed.filter((c: any) => c && c.name && !c.name.includes('Dr. Amanda Chen')));
        }
      }
    } catch {
      // ignore JSON parse error
    }

    // Sync from staff members storage if not already registered
    try {
      const staffStored = localStorage.getItem('clinixvault_staff_members');
      if (staffStored) {
        const staffList = JSON.parse(staffStored);
        if (Array.isArray(staffList)) {
          staffList.forEach((s: any) => {
            if (s && s.name && !s.name.includes('Dr. Amanda Chen') && !profiles.some((p) => p.id === s.id)) {
              profiles.push({
                id: s.id,
                name: s.name,
                role: s.role || 'Attending Physician',
                title: s.role || 'Licensed Clinician',
                department: s.department || 'Internal Medicine',
                npi: s.npi || `NPI-1000000000`,
                badgeId: `BADGE-${s.id}`,
                nodeId: s.assignedNode || 'CV-APPLIANCE-LOCAL',
                clinic: s.department || 'Clinical Suite',
                location: 'On-Premises Vault',
                firmware: 'v2.5.0-airgapped',
                authMethod: s.ssoStatus && s.ssoStatus.includes('Keycloak') ? 'Keycloak Active Directory SSO' : 'Hospital LDAP',
                avatarInitials: extractInitials(s.name),
                breakGlassAuthorized: Boolean(s.breakGlassPrivilege),
              });
            }
          });
        }
      }
    } catch {
      // ignore
    }

    return profiles;
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

    // Asynchronously commit to backend database
    void clinixApi.createClinician({
      id: profile.id,
      name: profile.name,
      role: profile.role,
      title: profile.title,
      department: profile.department,
      npi: profile.npi,
      badge_id: profile.badgeId,
      assigned_node: profile.nodeId,
      auth_method: profile.authMethod,
      avatar_initials: profile.avatarInitials,
      break_glass_authorized: profile.breakGlassAuthorized,
      status: 'Active',
    });
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

    // Asynchronously delete from backend database
    void clinixApi.deleteClinician(id);
  },

  getCurrentUser(): ClinicianProfile {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Exclude obsolete hardcoded mock name if lingering in user storage
        if (parsed && parsed.name && !parsed.name.includes('Dr. Amanda Chen')) {
          return parsed;
        }
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
    const found = registered.find((c) => c.id === profileId || c.name === profileId) || registered[0] || DEFAULT_GUEST_CLINICIAN;
    this.setCurrentUser(found);

    // Asynchronously activate on backend database
    if (found.id && !found.id.startsWith('clinician-unassigned')) {
      void clinixApi.activateClinician(found.id);
    }

    return found;
  },

  getAllProfiles(): ClinicianProfile[] {
    return this.getRegisteredClinicians();
  },
};
