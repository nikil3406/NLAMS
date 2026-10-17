import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../lib/auth';
import { authorizationService } from '../../../services/authorization';
import { administrativeUnitRepository } from '../../../repositories/administrative-unit.repository';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const roles = authContext?.roles ?? [];
  const permissions = authContext?.permissions ?? [];
  const assignments = authContext?.assignments ?? [];

  // Fetch real statistics from database
  const allUnits = await administrativeUnitRepository.getAllAdministrativeUnits();
  const totalUnits = allUnits.length;
  const activeUnits = allUnits.filter((u) => u.isActive).length;
  const rootUnits = allUnits.filter((u) => u.parentId === null).length;

  const modules = [
    {
      name: 'Administrative Units',
      description: 'Manage data-driven administrative hierarchy, state and district boundaries.',
      status: 'AVAILABLE',
      href: '/administrative-units',
      actionText: 'Manage Hierarchy →',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18" />
          <path d="M5 21V7l7-4 7 4v14" />
          <path d="M9 10h1v2H9z" />
          <path d="M14 10h1v2h-1z" />
          <path d="M9 15h1v2H9z" />
          <path d="M14 15h1v2h-1z" />
        </svg>
      ),
    },
    {
      name: 'User Management',
      description: 'Manage officer accounts, credentials, and administrative appointments.',
      status: 'COMING_SOON',
      phase: 'Phase 2, Step 2',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      name: 'Projects & Schemes',
      description: 'Infrastructure projects, highway corridors, and land acquisition proposals.',
      status: 'COMING_SOON',
      phase: 'Phase 3',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      name: 'Land Acquisition',
      description: 'Section 4, 11 notifications, joint measurement surveys, and award inquiries.',
      status: 'COMING_SOON',
      phase: 'Phase 4',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      ),
    },
    {
      name: 'GIS & Spatial Intelligence',
      description: 'PostGIS cadastral parcels, satellite overlays, and spatial boundary queries.',
      status: 'COMING_SOON',
      phase: 'Phase 5',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      ),
    },
    {
      name: 'Compensation & Awards',
      description: 'Direct Benefit Transfer (DBT), valuation schedules, and payment disbursements.',
      status: 'COMING_SOON',
      phase: 'Phase 6',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
  ];

  return (
    <div className="dashboard-content">
      {/* Welcome Banner */}
      <section className="welcome-banner">
        <div className="welcome-header">
          <span className="welcome-tag">PORTAL OVERVIEW</span>
          <h1 className="welcome-title">Welcome, {user.name}</h1>
          <p className="welcome-subtitle">
            National Land Acquisition Management System • Production Portal
          </p>
        </div>

        <div className="officer-profile-card">
          <div className="profile-grid">
            <div className="profile-item">
              <span className="profile-label">Assigned Role</span>
              <span className="profile-value-badge role-badge">
                {roles.join(', ') || 'Standard Officer'}
              </span>
            </div>

            <div className="profile-item">
              <span className="profile-label">Administrative Scope</span>
              <span className="profile-value">
                {authContext?.isSuperAdmin
                  ? 'National (Super Admin Authority)'
                  : assignments.length > 0
                  ? assignments
                      .map((a) => `${a.administrativeUnitName} (${a.administrativeUnitType})`)
                      .join(', ')
                  : 'No Active Assignments'}
              </span>
            </div>

            <div className="profile-item">
              <span className="profile-label">Active Permissions</span>
              <span className="profile-value-highlight">
                {permissions.length} System Permissions
              </span>
            </div>

            <div className="profile-item">
              <span className="profile-label">Account Status</span>
              <span className="profile-status-active">
                <span className="status-dot" />
                {user.status}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Real Hierarchy Metrics (PostgreSQL backed) */}
      <section className="metrics-section">
        <h2 className="section-title">Administrative Hierarchy Metrics</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon-box">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18" />
                <path d="M5 21V7l7-4 7 4v14" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{totalUnits}</span>
              <span className="metric-label">Total Administrative Units</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon-box status-active">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{activeUnits}</span>
              <span className="metric-label">Active Units</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon-box status-highlight">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </div>
            <div className="metric-data">
              <span className="metric-number">{rootUnits}</span>
              <span className="metric-label">Root Level Units</span>
            </div>
          </div>
        </div>
      </section>

      {/* System Modules Grid */}
      <section className="modules-section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">System Modules</h2>
            <p className="section-subtitle">
              Overview of NLAMS modular services and deployment roadmap
            </p>
          </div>
        </div>

        <div className="modules-grid">
          {modules.map((mod) => (
            <div
              key={mod.name}
              className={`module-card ${mod.status === 'AVAILABLE' ? 'available' : 'coming-soon'}`}
            >
              <div className="module-card-header">
                <div className="module-icon-wrapper">{mod.icon}</div>
                {mod.status === 'AVAILABLE' ? (
                  <span className="badge-available">Available</span>
                ) : (
                  <span className="badge-coming-soon">Coming Soon • {mod.phase}</span>
                )}
              </div>

              <h3 className="module-title">{mod.name}</h3>
              <p className="module-description">{mod.description}</p>

              <div className="module-card-footer">
                {mod.status === 'AVAILABLE' && mod.href ? (
                  <Link href={mod.href} className="module-action-link">
                    {mod.actionText}
                  </Link>
                ) : (
                  <span className="module-disabled-note">Scheduled for later phase</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
