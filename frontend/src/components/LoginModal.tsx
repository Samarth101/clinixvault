import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  ShieldCheck, 
  UserCheck, 
  CheckCircle2, 
  Building2, 
  Key, 
  ArrowRight,
  Server,
  UserPlus,
  Badge,
  Stethoscope
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { ClinicVaultLogo3D } from './ClinicVaultLogo3D';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, closeLoginModal, switchUser, loginWithCredentials, currentUser, availableUsers } = useAuth();
  const [activeTab, setActiveTab] = useState<'quick' | 'credentials'>('credentials');
  const [clinicianName, setClinicianName] = useState('');
  const [clinicianRole, setClinicianRole] = useState('Attending Physician');
  const [department, setDepartment] = useState('Internal Medicine');
  const [npi, setNpi] = useState('');
  const [password, setPassword] = useState('');
  const [authProvider, setAuthProvider] = useState<'Keycloak Active Directory SSO' | 'SmartCard PIV/CAC' | 'Hospital LDAP'>('Keycloak Active Directory SSO');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  if (!isLoginModalOpen) return null;

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicianName.trim()) return;

    setIsAuthenticating(true);
    setTimeout(() => {
      setIsAuthenticating(false);
      loginWithCredentials(
        clinicianName.trim(),
        authProvider,
        clinicianRole,
        department,
        npi.trim()
      );
      closeLoginModal();
    }, 500);
  };

  const handleSelectPreset = (id: string) => {
    switchUser(id);
    closeLoginModal();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeLoginModal}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-3xl rounded-[32px] border border-white/90 dark:border-slate-800 shadow-2xl p-6 sm:p-8 z-10 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                <ClinicVaultLogo3D 
                  size={48} 
                  interactive={true} 
                  enablePulseOnClick={true} 
                  enableBloom={false} 
                />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Hospital Authentication & Directory
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-200 dark:border-emerald-800">
                    Zero-Egress
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Authenticate clinician identity against Keycloak AD or on-prem smartcard vault
                </p>
              </div>
            </div>

            <button
              onClick={closeLoginModal}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl my-6">
            <button
              onClick={() => setActiveTab('credentials')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'credentials'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Register & Sign In Clinician
            </button>
            <button
              onClick={() => setActiveTab('quick')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'quick'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Active Directory Switcher ({availableUsers.length})
            </button>
          </div>

          {/* Tab 1: Credentials / Registration */}
          {activeTab === 'credentials' ? (
            <form onSubmit={handleCustomLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Identity Provider / SSO Protocol
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Keycloak Active Directory SSO', 'SmartCard PIV/CAC', 'Hospital LDAP'] as const).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => setAuthProvider(provider)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                        authProvider === provider
                          ? 'border-clinical-blue bg-blue-50/70 dark:bg-blue-950/40 text-clinical-blue dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <Building2 className="w-4 h-4 mb-1" />
                      <div className="truncate">{provider.split(' ')[0]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Clinician Full Name *
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Jane Smith, MD"
                      value={clinicianName}
                      onChange={(e) => setClinicianName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Clinical Role / Title
                  </label>
                  <div className="relative">
                    <Stethoscope className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select
                      value={clinicianRole}
                      onChange={(e) => setClinicianRole(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                    >
                      <option value="Attending Physician">Attending Physician</option>
                      <option value="Staff Radiologist">Staff Radiologist</option>
                      <option value="Chief Medical Information Officer">CMIO</option>
                      <option value="Lead Clinical Nurse">Lead Clinical Nurse</option>
                      <option value="Emergency Physician">Emergency Physician</option>
                      <option value="Resident Physician">Resident Physician</option>
                      <option value="Physician Assistant">Physician Assistant</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Department
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                  >
                    <option value="Internal Medicine">Internal Medicine</option>
                    <option value="Diagnostic Radiology">Diagnostic Radiology</option>
                    <option value="Ambulatory Care">Ambulatory Care</option>
                    <option value="Emergency Medicine">Emergency Medicine</option>
                    <option value="Critical Care / ICU">Critical Care / ICU</option>
                    <option value="Orthopedic Surgery">Orthopedic Surgery</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    NPI Number (Optional)
                  </label>
                  <div className="relative">
                    <Badge className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="e.g. 1948201948"
                      value={npi}
                      onChange={(e) => setNpi(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Enterprise PIN / Passcode
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>
                  Air-Gapped Sovereign Vault: Credentials and audit trails remain strictly on-premises.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeLoginModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAuthenticating || !clinicianName.trim()}
                  className="px-6 py-2.5 rounded-xl bg-clinical-blue hover:bg-clinical-dark text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isAuthenticating ? (
                    <>
                      <Server className="w-4 h-4 animate-spin" />
                      <span>Authenticating Session...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Register & Sign In</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Tab 2: Quick Clinician Switcher */
            <div className="space-y-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Switch active authenticated clinician identity in this air-gapped terminal:
              </p>

              {availableUsers.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-center space-y-3">
                  <UserCheck className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    No Clinicians Registered Yet
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    No clinician identities have been saved to local vault storage. Switch to the Register tab to add your profile.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('credentials')}
                    className="px-4 py-2 rounded-xl bg-clinical-blue text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Register First Clinician</span>
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 max-h-72 overflow-y-auto">
                  {availableUsers.map((profile) => {
                    const isCurrent = currentUser?.id === profile.id;
                    return (
                      <motion.div
                        key={profile.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => handleSelectPreset(profile.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                          isCurrent
                            ? 'bg-blue-50/90 dark:bg-blue-950/40 border-clinical-blue shadow-sm'
                            : 'bg-white dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-sm text-white">
                            {profile.avatarInitials}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                {profile.name}
                              </h4>
                              {isCurrent && (
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900 text-clinical-blue dark:text-blue-300 rounded-md">
                                  ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">{profile.role}</span>
                              <span>•</span>
                              <span className="font-mono">{profile.npi}</span>
                              <span>•</span>
                              <span>{profile.department}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-bold text-clinical-blue dark:text-blue-400">
                          {isCurrent ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <div className="flex items-center gap-1">
                              <span>Select</span>
                              <ArrowRight className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
