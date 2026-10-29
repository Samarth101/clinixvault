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
  Server
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { ClinicVaultLogo3D } from './ClinicVaultLogo3D';

export const LoginModal: React.FC = () => {
  const { isLoginModalOpen, closeLoginModal, switchUser, loginWithCredentials, currentUser, availableUsers } = useAuth();
  const [activeTab, setActiveTab] = useState<'quick' | 'credentials'>('quick');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authProvider, setAuthProvider] = useState<'Keycloak Active Directory SSO' | 'SmartCard PIV/CAC' | 'Hospital LDAP'>('Keycloak Active Directory SSO');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  if (!isLoginModalOpen) return null;

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setTimeout(() => {
      setIsAuthenticating(false);
      loginWithCredentials(username || 'Dr. Amanda Chen, MD, CMIO', authProvider);
    }, 800);
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
                  Hospital Authentication & SSO
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
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switch Tabs */}
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl my-6">
            <button
              onClick={() => setActiveTab('quick')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'quick'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Quick Clinician Switcher (Presetted)
            </button>
            <button
              onClick={() => setActiveTab('credentials')}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'credentials'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Keycloak / Active Directory Login
            </button>
          </div>

          {/* Quick Presets Tab */}
          {activeTab === 'quick' ? (
            <div className="space-y-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a verified hospital clinician profile to simulate different permission tiers and clinical roles:
              </p>

              <div className="grid gap-3">
                {availableUsers.map((profile) => {
                  const isCurrent = currentUser.id === profile.id;
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
                        <div
                          className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm text-white ${
                            profile.id === 'dr-amanda-chen'
                              ? 'bg-gradient-to-tr from-blue-600 to-indigo-600'
                              : profile.id === 'dr-marcus-vance'
                              ? 'bg-gradient-to-tr from-indigo-600 to-purple-600'
                              : 'bg-gradient-to-tr from-emerald-600 to-teal-600'
                          }`}
                        >
                          {profile.avatarInitials}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {profile.name}
                            </h4>
                            {isCurrent && (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-100 dark:bg-blue-900 text-clinical-blue dark:text-blue-300 rounded-md">
                                CURRENT
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{profile.role}</span>
                            <span>•</span>
                            <span className="font-mono">{profile.npi}</span>
                            <span>•</span>
                            <span>{profile.location}</span>
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
            </div>
          ) : (
            /* Credentials / Keycloak SSO Form */
            <form onSubmit={handleCustomLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Identity Provider / SSO Endpoint
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Keycloak Active Directory SSO', 'SmartCard PIV/CAC', 'Hospital LDAP'] as const).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => setAuthProvider(provider)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                        authProvider === provider
                          ? 'border-clinical-blue bg-blue-50/70 dark:bg-blue-950/40 text-clinical-blue dark:text-blue-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Building2 className="w-4 h-4 mb-1" />
                      <div className="truncate">{provider.split(' ')[0]}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Clinician Username / NPI / Email
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. achen@hospital.vault.lan or NPI-1948201948"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Enterprise PIN / HSM Token
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
                  Air-Gapped Vault: Passwords and tokens never leave this subnet. Local Kerberos & Keycloak SAML verification active.
                </span>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeLoginModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAuthenticating}
                  className="px-6 py-2.5 rounded-xl bg-clinical-blue hover:bg-clinical-dark text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
                >
                  {isAuthenticating ? (
                    <>
                      <Server className="w-4 h-4 animate-spin" />
                      <span>Verifying AD Token...</span>
                    </>
                  ) : (
                    <>
                      <span>Authenticate Session</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
