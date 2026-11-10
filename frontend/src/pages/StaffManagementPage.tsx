import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  Filter, 
  CheckCircle2, 
  X, 
  FileSpreadsheet, 
  Trash2, 
  PhoneCall,
  Building2,
  BadgeCheck,
  LogIn,
  Stethoscope,
  Activity
} from 'lucide-react';
import { StaffMember } from '../types';
import { authService } from '../services/authService';
import { clinixApi } from '../services/api';
import { useAuth } from '../context/useAuth';

export const StaffManagementPage: React.FC = () => {
  const { currentUser, switchUser } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>(() => {
    try {
      const stored = localStorage.getItem('clinixvault_staff_members');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedTier, setSelectedTier] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Sync with backend database on mount
  useEffect(() => {
    const syncWithDb = async () => {
      try {
        const dbClinicians = await clinixApi.getClinicians();
        if (Array.isArray(dbClinicians) && dbClinicians.length > 0) {
          const mapped: StaffMember[] = dbClinicians.map((c: any) => ({
            id: c.id,
            name: c.name,
            role: c.role || 'Attending Physician',
            department: c.department || 'Internal Medicine',
            specialty: c.specialty || 'Clinical Medicine',
            npi: c.npi || `NPI-1000000000`,
            email: c.email || `${c.name.toLowerCase().replace(/[^a-z]/g, '.')}@memorial.clinixvault.internal`,
            accessTier: (c.access_tier as StaffMember['accessTier']) || 'Tier 1 — Executive/Attending',
            breakGlassPrivilege: Boolean(c.break_glass_authorized),
            ssoStatus: (c.sso_status as StaffMember['ssoStatus']) || 'Active Directory Synced',
            status: (c.status as StaffMember['status']) || 'Active',
            assignedNode: c.assigned_node || 'CV-NODE-01 (Exam 1-4)',
            lastActive: 'Active in Database',
          }));
          setStaffList(mapped);
        }
      } catch {
        // ignore
      }
    };
    void syncWithDb();
  }, []);

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

  // Switch active session to this staff member
  const handleSwitchSession = (staff: StaffMember) => {
    switchUser(staff.id);
    showNotification(`Active clinical session authenticated as ${staff.name}`);
  };

  // Toggle Break-Glass privileges directly
  const handleToggleBreakGlass = (id: string) => {
    setStaffList((prev) =>
      prev.map((staff) => {
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
      })
    );
  };

  // Toggle status
  const handleToggleStatus = (id: string) => {
    setStaffList((prev) =>
      prev.map((staff) => {
        if (staff.id === id) {
          const nextStatus: StaffMember['status'] = 
            staff.status === 'Active' ? 'On-Call' : staff.status === 'On-Call' ? 'Offline' : 'Active';
          showNotification(`Duty status for ${staff.name} set to ${nextStatus}`);
          return { ...staff, status: nextStatus };
        }
        return staff;
      })
    );
  };

  // Remove staff
  const handleRemoveStaff = (id: string, name: string) => {
    setStaffList((prev) => prev.filter((staff) => staff.id !== id));
    authService.removeClinician(id);
    showNotification(`Decommissioned access credentials for ${name}`);
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

    // Also register into sovereign clinician auth directory
    const initials = newStaff.name
      .split(' ')
      .filter((p) => !['Dr.', 'MD,', 'RN,', 'MS,', 'BSN,', 'CISSP'].includes(p))
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase() || 'MD';

    authService.registerClinician({
      id: newStaff.id,
      name: newStaff.name,
      role: newStaff.role,
      title: newStaff.role,
      department: newStaff.department,
      npi: newStaff.npi,
      badgeId: `BADGE-${newStaff.id}`,
      nodeId: newStaff.assignedNode || 'CV-APPLIANCE-LOCAL',
      clinic: newStaff.department,
      location: 'On-Premises Air-Gapped Vault',
      firmware: 'v2.5.0-airgapped',
      authMethod: newStaff.ssoStatus.includes('Keycloak') ? 'Keycloak Active Directory SSO' : 'Hospital LDAP',
      avatarInitials: initials,
      breakGlassAuthorized: newStaff.breakGlassPrivilege,
    });

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

  const handleExportRoster = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      "ID,Name,Role,Department,Specialty,NPI,Email,AccessTier,BreakGlass,SSOStatus,Status\n" +
      staffList.map((s) => `"${s.id}","${s.name}","${s.role}","${s.department}","${s.specialty}","${s.npi}","${s.email}","${s.accessTier}","${s.breakGlassPrivilege}","${s.ssoStatus}","${s.status}"`).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `ClinixVault_Staff_Roster_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification("Exported staff directory to local CSV format.");
  };

  const departments = [
    'All', 
    'Internal Medicine', 
    'Diagnostic Radiology', 
    'Cardiovascular Medicine', 
    'Ambulatory Operations', 
    'Emergency Department', 
    'Information Security', 
    'Intensive Care Unit'
  ];

  const filteredStaff = staffList.filter((s) => {
    const matchesSearch = 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.npi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesDept = selectedDept === 'All' || s.department === selectedDept;
    const matchesTier = selectedTier === 'All' || s.accessTier.includes(selectedTier);
    const matchesStatus = selectedStatus === 'All' || s.status === selectedStatus;

    return matchesSearch && matchesDept && matchesTier && matchesStatus;
  });

  const onCallCount = staffList.filter((s) => s.status === 'On-Call').length;
  const breakGlassCount = staffList.filter((s) => s.breakGlassPrivilege).length;
  const activeCount = staffList.filter((s) => s.status === 'Active').length;

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
            disabled={staffList.length === 0}
            className="px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Roster</span>
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 rounded-2xl bg-clinical-blue hover:bg-clinical-dark text-white text-sm font-bold flex items-center gap-2 shadow-md shadow-blue-500/25 transition-all cursor-pointer"
          >
            <UserPlus className="w-4.5 h-4.5" />
            <span>Register Clinician / Staff</span>
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
            <span>ON-DUTY NOW</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{activeCount}</div>
          <div className="text-xs text-slate-500 mt-1">Actively charting & reviewing</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>CURRENTLY ON-CALL</span>
            <PhoneCall className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">{onCallCount}</div>
          <div className="text-xs text-slate-500 mt-1">Available for trauma escalation</div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold mb-2">
            <span>BREAK-GLASS CLEARED</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">{breakGlassCount}</div>
          <div className="text-xs text-slate-500 mt-1">Emergency override authorized</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-card p-4 sm:p-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by clinician name, specialty, role, NPI, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Department */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
            >
              {departments.map((dept) => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>

          {/* Access Tier */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
            >
              <option value="All">All Access Tiers</option>
              <option value="Tier 1">Tier 1 — Executive/Attending</option>
              <option value="Tier 2">Tier 2 — Fellow/Resident</option>
              <option value="Tier 3">Tier 3 — Physician Assistant</option>
              <option value="Tier 4">Tier 4 — Registered Nurse</option>
              <option value="SysAdmin">SysAdmin</option>
            </select>
          </div>

          {/* Duty Status */}
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="py-1.5 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
            >
              <option value="All">All Duty Statuses</option>
              <option value="Active">Active / On-Duty</option>
              <option value="On-Call">On-Call</option>
              <option value="Offline">Offline / Off-Duty</option>
            </select>
          </div>
        </div>
      </div>

      {/* Directory Table / Empty State */}
      {staffList.length === 0 ? (
        <div className="p-12 text-center rounded-[28px] bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center font-bold">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
            No Clinicians or Staff Provisioned Yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            The on-premises credential directory is clean. Register attending physicians, radiologists, or nursing staff to configure role-based access control and break-glass emergency privileges.
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-clinical-blue text-white text-xs font-bold hover:bg-blue-700 transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register First Clinician</span>
          </button>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Clinician / Staff Member</th>
                  <th className="py-3.5 px-4">Role & Department</th>
                  <th className="py-3.5 px-4">Access Tier</th>
                  <th className="py-3.5 px-4">Break-Glass</th>
                  <th className="py-3.5 px-4">SSO & Node</th>
                  <th className="py-3.5 px-4">Duty Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {filteredStaff.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                      No staff members match the selected filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredStaff.map((staff) => {
                    const initials = staff.name
                      .split(' ')
                      .filter((p) => !['Dr.', 'MD,', 'RN,', 'MS,', 'BSN,', 'CISSP'].includes(p))
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase();

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
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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

                        {/* Duty Status */}
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
                          <div className="flex items-center justify-end gap-1.5">
                            {currentUser.id === staff.id || currentUser.name === staff.name ? (
                              <span className="px-2.5 py-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl inline-flex items-center gap-1 border border-emerald-200 dark:border-emerald-800">
                                <BadgeCheck className="w-3.5 h-3.5" />
                                <span>Active</span>
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSwitchSession(staff)}
                                title={`Sign in session as ${staff.name}`}
                                className="px-2.5 py-1.5 text-xs font-bold text-clinical-blue hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">Sign In</span>
                              </button>
                            )}

                            <button
                              onClick={() => handleRemoveStaff(staff.id, staff.name)}
                              title="Revoke and delete staff credentials"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 z-10 overflow-hidden"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-900/40 text-clinical-blue flex items-center justify-center font-bold">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      Provision New Hospital Staff
                    </h2>
                    <p className="text-xs text-slate-500">
                      Issue cryptographic credentials for zero-egress clinical workstation
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddStaffSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Clinician Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Marcus Vance, MD"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Clinical Role / Title *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Attending Physician / Scribe"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Hospital Department
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                    >
                      <option value="Internal Medicine">Internal Medicine</option>
                      <option value="Diagnostic Radiology">Diagnostic Radiology</option>
                      <option value="Ambulatory Care">Ambulatory Care</option>
                      <option value="Emergency Medicine">Emergency Medicine</option>
                      <option value="Critical Care / ICU">Critical Care / ICU</option>
                      <option value="Information Security">Information Security</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Clinical Specialty
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Thoracic Imaging, Triage"
                      value={formData.specialty}
                      onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      NPI Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 1948201948"
                      value={formData.npi}
                      onChange={(e) => setFormData({ ...formData, npi: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Access Clearance Tier
                    </label>
                    <select
                      value={formData.accessTier}
                      onChange={(e) => setFormData({ ...formData, accessTier: e.target.value as StaffMember['accessTier'] })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                    >
                      <option value="Tier 1 — Executive/Attending">Tier 1 — Executive CMIO / Attending</option>
                      <option value="Tier 2 — Fellow/Resident">Tier 2 — Fellow / Resident</option>
                      <option value="Tier 3 — Physician Assistant">Tier 3 — Physician Assistant</option>
                      <option value="Tier 4 — Registered Nurse">Tier 4 — Registered Nurse</option>
                      <option value="SysAdmin — Infrastructure Clearance">SysAdmin Clearance</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      SSO Identity Provider
                    </label>
                    <select
                      value={formData.ssoStatus}
                      onChange={(e) => setFormData({ ...formData, ssoStatus: e.target.value as StaffMember['ssoStatus'] })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                    >
                      <option value="Active Directory Synced">Keycloak Active Directory</option>
                      <option value="Keycloak SAML Synced">SmartCard PIV/CAC Hardware</option>
                      <option value="Local Vault Pin">Local Air-Gap Appliance HSM</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Assigned Appliance Node
                    </label>
                    <select
                      value={formData.assignedNode}
                      onChange={(e) => setFormData({ ...formData, assignedNode: e.target.value })}
                      className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-clinical-blue cursor-pointer"
                    >
                      <option value="CV-NODE-01 (Exam 1-4)">CV-NODE-01 (Exam 1-4)</option>
                      <option value="CV-NODE-02 (Radiology PACS)">CV-NODE-02 (Radiology PACS)</option>
                      <option value="CV-NODE-03 (ED / Triage)">CV-NODE-03 (ED / Triage)</option>
                      <option value="CV-NODE-04 (ICU Critical Care)">CV-NODE-04 (ICU Critical Care)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.breakGlassPrivilege}
                      onChange={(e) => setFormData({ ...formData, breakGlassPrivilege: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Grant Emergency Break-Glass Override Privilege
                    </span>
                  </label>
                </div>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-clinical-blue hover:bg-clinical-dark text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Issue Credentials</span>
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
