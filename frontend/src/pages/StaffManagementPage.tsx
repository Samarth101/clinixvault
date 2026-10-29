import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  Key, 
  Search, 
  Filter, 
  CheckCircle2, 
  X, 
  FileSpreadsheet, 
  Trash2, 
  PhoneCall,
  Building2,
  BadgeCheck
} from 'lucide-react';
import { StaffMember } from '../types';
import { INITIAL_STAFF_MEMBERS } from '../data/systemDefaults';

export const StaffManagementPage: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    try {
      const stored = localStorage.getItem('clinixvault_staff_members');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return INITIAL_STAFF_MEMBERS;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedTier, setSelectedTier] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Sync changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('clinixvault_staff_members', JSON.stringify(staffList));
    } catch {
      // ignore
    }
  }, [staffList]);

  // Form State for Adding Staff
  const [formData, setFormData] = useState({
    name: '',
    role: 'Attending Physician',
    department: 'Internal Medicine',
    specialty: 'Clinical Medicine',
    npi: '',
    email: '',
    accessTier: 'Tier 1 — Executive/Attending' as StaffMember['accessTier'],
    breakGlassPrivilege: false,
    ssoStatus: 'Active Directory Synced' as StaffMember['ssoStatus'],
    status: 'Active' as StaffMember['status'],
    assignedNode: 'CV-NODE-01 (Exam 1-4)',
  });

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Toggle Break-Glass privileges directly
  const handleToggleBreakGlass = (id: string) => {
    setStaffList(prev => prev.map(staff => {
      if (staff.id === id) {
        const updated = !staff.breakGlassPrivilege;
        showNotification(
          updated 
            ? `Break-Glass Emergency privileges GRANTED to ${staff.name}`
            : `Break-Glass privileges REVOKED for ${staff.name}`
        );
        return { ...staff, breakGlassPrivilege: updated };
      }
      return staff;
    }));
  };

  // Toggle status
  const handleToggleStatus = (id: string) => {
    setStaffList(prev => prev.map(staff => {
      if (staff.id === id) {
        const nextStatus: StaffMember['status'] = 
          staff.status === 'Active' ? 'On-Call' : staff.status === 'On-Call' ? 'Offline' : 'Active';
        showNotification(`Status for ${staff.name} set to ${nextStatus}`);
        return { ...staff, status: nextStatus };
      }
      return staff;
    }));
  };

  // Remove staff
  const handleRemoveStaff = (id: string, name: string) => {
    setStaffList(prev => prev.filter(staff => staff.id !== id));
    showNotification(`Decommissioned access credential for ${name}`);
  };

  // Add new staff submit
  const handleAddStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const newId = `STF-${Math.floor(1000 + Math.random() * 9000)}`;
    const emailToUse = formData.email.trim() || 
      `${formData.name.toLowerCase().replace(/[^a-z]/g, '.')}@memorial.clinixvault.internal`;

    const newStaff: StaffMember = {
      id: newId,
      name: formData.name.trim(),
      role: formData.role,
      department: formData.department,
      specialty: formData.specialty,
      npi: formData.npi.trim() || `NPI-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: emailToUse,
      accessTier: formData.accessTier,
      breakGlassPrivilege: formData.breakGlassPrivilege,
      ssoStatus: formData.ssoStatus,
      status: formData.status,
      assignedNode: formData.assignedNode,
      lastActive: 'Just now (New Provision)',
    };

    setStaffList([newStaff, ...staffList]);
    setIsAddModalOpen(false);
    showNotification(`Successfully provisioned air-gapped credentials for ${newStaff.name}`);

    // Reset Form
    setFormData({
      name: '',
      role: 'Attending Physician',
      department: 'Internal Medicine',
      specialty: 'Clinical Medicine',
      npi: '',
      email: '',
      accessTier: 'Tier 1 — Executive/Attending',
      breakGlassPrivilege: false,
      ssoStatus: 'Active Directory Synced',
      status: 'Active',
      assignedNode: 'CV-NODE-01 (Exam 1-4)',
    });
  };

  // Export Roster
  const handleExportRoster = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "ID,Name,Role,Department,Specialty,NPI,Email,AccessTier,BreakGlass,SSOStatus,Status\n" +
      staffList.map(s => `"${s.id}","${s.name}","${s.role}","${s.department}","${s.specialty}","${s.npi}","${s.email}","${s.accessTier}","${s.breakGlassPrivilege}","${s.ssoStatus}","${s.status}"`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ClinixVault_Staff_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Exported staff directory to local CSV format.");
  };

  const departments = ['All', 'Internal Medicine', 'Diagnostic Radiology', 'Cardiovascular Medicine', 'Ambulatory Operations', 'Emergency Department', 'Information Security', 'Intensive Care Unit'];

  const filteredStaff = staffList.filter(s => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.npi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDept = selectedDept === 'All' || s.department === selectedDept;
    const matchesTier = selectedTier === 'All' || s.accessTier.includes(selectedTier);

    return matchesSearch && matchesDept && matchesTier;
  });

  return (
    <div className="space-y-8 pb-16">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-6 z-50 px-4 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700/80 flex items-center gap-3 text-sm font-semibold"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-50 dark:bg-blue-900/40 text-clinical-blue dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Role-Based Access Control (RBAC)
            </span>
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" /> 100% On-Prem Zero-Egress Directory
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Staff & Providers Directory
          </h1>
          <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 mt-1">
            Manage hospital clinicians, scribes, radiologists, and air-gap appliance operators with hardware cryptographic clearance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportRoster}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold flex items-center gap-2 shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Roster</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-clinical-blue hover:bg-clinical-dark text-white text-sm font-bold flex items-center gap-2 shadow-md shadow-blue-500/25 transition-all"
          >
            <UserPlus className="w-4.5 h-4.5" />
            <span>Add New Provider / Staff</span>
          </button>
        </div>
      </div>

      {/* Stats Counter Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>TOTAL PROVISIONED</span>
            <Users className="w-4 h-4 text-clinical-blue" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">{staffList.length}</div>
          <div className="text-xs text-slate-500 mt-1">Active hospital staff identities</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>CURRENTLY ON-CALL</span>
            <PhoneCall className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {staffList.filter(s => s.status === 'On-Call').length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Immediate pager notification ready</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>BREAK-GLASS PRIVILEGES</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {staffList.filter(s => s.breakGlassPrivilege).length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Emergency bypass authorized</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>AIR-GAP SSO INTEGRATION</span>
            <Key className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            100%
          </div>
          <div className="text-xs text-slate-500 mt-1">LDAP & SAML HSM Enforced</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-card p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by physician name, specialty, role, NPI, or internal email..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/70 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
            />
          </div>

          {/* Tier Dropdown */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-clinical-blue"
            >
              <option value="All">All Clearance Tiers</option>
              <option value="Tier 1">Tier 1 — Executive/Attending</option>
              <option value="Tier 2">Tier 2 — Fellow/Resident</option>
              <option value="Tier 3">Tier 3 — Clinical Scribe</option>
              <option value="Tier 4">Tier 4 — Registered Nurse</option>
              <option value="SysAdmin">SysAdmin — Air-Gap Vault</option>
            </select>
          </div>
        </div>

        {/* Department Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {departments.map((dept) => {
            const isSelected = selectedDept === dept;
            return (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-clinical-blue text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {dept}
              </button>
            );
          })}
        </div>
      </div>

      {/* Staff Roster Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 dark:bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3.5 px-6">Clinician / Staff Member</th>
                <th className="py-3.5 px-4">Role & Department</th>
                <th className="py-3.5 px-4">Access Tier</th>
                <th className="py-3.5 px-4">Break-Glass</th>
                <th className="py-3.5 px-4">SSO & Node</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              {filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                    No staff members match the selected search criteria.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const initials = staff.name.split(' ').filter(p => !['Dr.', 'MD,', 'RN,', 'MS,', 'BSN,', 'CISSP'].includes(p)).slice(0, 2).map(n => n[0]).join('');
                  return (
                    <tr key={staff.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/40 transition-colors">
                      {/* Name & ID */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                            {initials || staff.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{staff.name}</span>
                              {staff.accessTier.includes('Tier 1') && (
                                <BadgeCheck className="w-4 h-4 text-clinical-blue inline" />
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                              <span>{staff.id}</span>
                              <span>•</span>
                              <span>NPI: {staff.npi}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Dept */}
                      <td className="py-4 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200 text-xs sm:text-sm">
                          {staff.role}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{staff.department}</span>
                        </div>
                      </td>

                      {/* Access Tier */}
                      <td className="py-4 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-semibold ${
                          staff.accessTier.includes('Tier 1')
                            ? 'bg-blue-100/80 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : staff.accessTier.includes('Tier 2')
                            ? 'bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : staff.accessTier.includes('Tier 3')
                            ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : staff.accessTier.includes('SysAdmin')
                            ? 'bg-purple-100/80 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}>
                          {staff.accessTier.split(' — ')[0]}
                        </span>
                      </td>

                      {/* Break Glass */}
                      <td className="py-4 px-4">
                        <button
                          onClick={() => handleToggleBreakGlass(staff.id)}
                          title="Click to toggle Break-Glass Emergency privilege"
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all ${
                            staff.breakGlassPrivilege
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                          }`}
                        >
                          <ShieldAlert className={`w-3.5 h-3.5 ${staff.breakGlassPrivilege ? 'text-rose-600' : 'text-slate-400'}`} />
                          <span>{staff.breakGlassPrivilege ? 'Enabled' : 'Disabled'}</span>
                        </button>
                      </td>

                      {/* SSO & Node */}
                      <td className="py-4 px-4">
                        <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {staff.ssoStatus}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {staff.assignedNode}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <button
                          onClick={() => handleToggleStatus(staff.id)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all ${
                            staff.status === 'Active'
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : staff.status === 'On-Call'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            staff.status === 'Active' ? 'bg-emerald-500' : staff.status === 'On-Call' ? 'bg-amber-500' : 'bg-slate-400'
                          }`} />
                          <span>{staff.status}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleRemoveStaff(staff.id, staff.name)}
                          title="Revoke and delete staff credentials"
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Staff Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-md"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 my-8"
            >
              <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-clinical-blue/10 text-clinical-blue flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Provision New Provider / Staff Identity
                    </h2>
                    <p className="text-xs text-slate-500">
                      Issue local air-gapped cryptographic clearance & RBAC role
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddStaffSubmit} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Full Name & Credentials *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Robert Lang, MD"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Clinical Role
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    >
                      <option value="Attending Physician">Attending Physician</option>
                      <option value="Attending Radiologist">Attending Radiologist</option>
                      <option value="Fellow / Chief Resident">Fellow / Chief Resident</option>
                      <option value="Lead Clinical AI Scribe">Lead Clinical AI Scribe</option>
                      <option value="Nurse Practitioner / RN">Nurse Practitioner / RN</option>
                      <option value="Vault SysAdmin & CISO">Vault SysAdmin & CISO</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Department
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    >
                      <option value="Internal Medicine">Internal Medicine</option>
                      <option value="Diagnostic Radiology">Diagnostic Radiology</option>
                      <option value="Cardiovascular Medicine">Cardiovascular Medicine</option>
                      <option value="Emergency Department">Emergency Department</option>
                      <option value="Ambulatory Operations">Ambulatory Operations</option>
                      <option value="Intensive Care Unit">Intensive Care Unit</option>
                      <option value="Information Security">Information Security</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      NPI / State License #
                    </label>
                    <input
                      type="text"
                      placeholder="10-digit NPI number"
                      value={formData.npi}
                      onChange={(e) => setFormData({ ...formData, npi: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Specialty
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Interventional Pulmonology"
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Clearance & RBAC Tier
                  </label>
                  <select
                    value={formData.accessTier}
                    onChange={(e) => setFormData({ ...formData, accessTier: e.target.value as StaffMember['accessTier'] })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                  >
                    <option value="Tier 1 — Executive/Attending">Tier 1 — Executive / Attending (Full Clinical & Signing Authority)</option>
                    <option value="Tier 2 — Fellow/Resident">Tier 2 — Fellow / Resident (Clinical Orders with Attending Co-Sign)</option>
                    <option value="Tier 3 — Clinical Scribe">Tier 3 — Clinical Scribe (Ambient Scribe Note Draft Only)</option>
                    <option value="Tier 4 — Registered Nurse">Tier 4 — Registered Nurse (Vitals & Triage Entry)</option>
                    <option value="SysAdmin — Air-Gap Vault">SysAdmin — Air-Gap Vault (Appliance & Pod Configuration)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      SSO Identity Provider
                    </label>
                    <select
                      value={formData.ssoStatus}
                      onChange={(e) => setFormData({ ...formData, ssoStatus: e.target.value as StaffMember['ssoStatus'] })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    >
                      <option value="Active Directory Synced">Active Directory Synced (Kerberos/LDAP)</option>
                      <option value="Keycloak SAML Synced">Keycloak SAML Synced (FIDO2 / PIV Card)</option>
                      <option value="Local Vault Pin">Local Vault Pin (Emergency Air-Gap HSM)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Assigned Appliance Node
                    </label>
                    <input
                      type="text"
                      value={formData.assignedNode}
                      onChange={(e) => setFormData({ ...formData, assignedNode: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/60 flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-rose-900 dark:text-rose-200 block">
                        Grant Break-Glass Emergency Privilege
                      </span>
                      <span className="text-[11px] text-rose-700/80 dark:text-rose-300/80">
                        Authorizes unapproved override of HIPAA restrictions during cardiac arrest or code blue
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.breakGlassPrivilege}
                    onChange={(e) => setFormData({ ...formData, breakGlassPrivilege: e.target.checked })}
                    className="w-5 h-5 accent-rose-600 rounded cursor-pointer"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-clinical-blue hover:bg-clinical-dark text-white text-sm font-bold shadow-md shadow-blue-500/20"
                  >
                    Provision & Issue Credential
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
