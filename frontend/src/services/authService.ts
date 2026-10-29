/**
 * ClinixVault Authentication Service & Pre-Configured Clinical Personas
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

export const PRECONFIGURED_CLINICIANS: ClinicianProfile[] = [
  {
    id: 'dr-amanda-chen',
    name: 'Dr. Amanda Chen, MD, CMIO',
    role: 'Chief Medical Information Officer',
    title: 'Attending Physician & CMIO',
    department: 'Internal Medicine & Musculoskeletal Suite',
    npi: 'NPI-1948201948',
    badgeId: 'STAFF-AC-04',
    nodeId: 'CV-APPLIANCE-WEST-09',
    clinic: 'Internal Medicine Suite',
    location: 'Air-Gapped Vault #4 • Room 204',
    firmware: 'v2.4.1-airgapped-prod',
    authMethod: 'Keycloak Active Directory SSO',
    avatarInitials: 'AC',
    breakGlassAuthorized: true,
  },
  {
    id: 'dr-marcus-vance',
    name: 'Dr. Marcus Vance, MD, FACR',
    role: 'Attending Radiologist',
    title: 'Senior Imaging Diagnostic Lead',
    department: 'Diagnostic Radiology & Thoracic Imaging',
    npi: 'NPI-1420958190',
    badgeId: 'STAFF-MV-12',
    nodeId: 'CV-APPLIANCE-RAD-02',
    clinic: 'Radiology PACS Suite',
    location: 'Air-Gapped Vault #2 • Reading Room B',
    firmware: 'v2.4.1-airgapped-prod',
    authMethod: 'Keycloak Active Directory SSO',
    avatarInitials: 'MV',
    breakGlassAuthorized: true,
  },
  {
    id: 'sarah-jenkins',
    name: 'Sarah Jenkins, MSN, RN',
    role: 'Lead Triage Nurse',
    title: 'Lead Clinical Triage Specialist',
    department: 'Emergency & Acute Care Triage',
    npi: 'NPI-1882049102',
    badgeId: 'STAFF-SJ-29',
    nodeId: 'CV-APPLIANCE-ED-01',
    clinic: 'Acute Assessment & Triage Unit',
    location: 'Air-Gapped Vault #1 • Station 3',
    firmware: 'v2.4.1-airgapped-prod',
    authMethod: 'Hospital LDAP',
    avatarInitials: 'SJ',
    breakGlassAuthorized: false,
  },
];

const STORAGE_KEY = 'clinixvault_authenticated_user';

export const authService = {
  getCurrentUser(): ClinicianProfile {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore JSON parse error
    }
    return PRECONFIGURED_CLINICIANS[0];
  },

  setCurrentUser(user: ClinicianProfile): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch {
      // ignore
    }
  },

  logout(): void {
    // Reverts to default or clears
    localStorage.removeItem(STORAGE_KEY);
  },

  loginWithSSO(profileId: string): ClinicianProfile {
    const found = PRECONFIGURED_CLINICIANS.find((c) => c.id === profileId) || PRECONFIGURED_CLINICIANS[0];
    this.setCurrentUser(found);
    return found;
  },

  getAllProfiles(): ClinicianProfile[] {
    return PRECONFIGURED_CLINICIANS;
  },
};
