'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: (props: { className?: string }) => React.ReactNode;
  isAvailable: boolean;
  badge?: string;
}

interface NavGroup {
  groupName: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = true, onClose }) => {
  const pathname = usePathname();

  const navigation: NavGroup[] = [
    {
      groupName: 'Core',
      items: [
        {
          name: 'Dashboard',
          href: '/dashboard',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          ),
        },
      ],
    },
    {
      groupName: 'Administration',
      items: [
        {
          name: 'Administrative Units',
          href: '/administrative-units',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          name: 'Users',
          href: '/users',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ),
        },
        {
          name: 'Roles & Permissions',
          href: '/roles',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ),
        },
      ],
    },
    {
      groupName: 'Land Operations',
      items: [
        {
          name: 'Projects',
          href: '/projects',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          ),
        },
        {
          name: 'Acquisition Cases',
          href: '/acquisition-cases',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          ),
        },
        {
          name: 'GIS & Spatial',
          href: '/gis',
          isAvailable: false,
          badge: 'Soon',
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
          ),
        },
        {
          name: 'Compensation',
          href: '/compensation',
          isAvailable: false,
          badge: 'Soon',
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          ),
        },
        {
          name: 'Documents',
          href: '/documents',
          isAvailable: false,
          badge: 'Soon',
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          ),
        },
        {
          name: 'Reports',
          href: '/reports',
          isAvailable: false,
          badge: 'Soon',
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          ),
        },
      ],
    },
    {
      groupName: 'Account',
      items: [
        {
          name: 'My Profile',
          href: '/profile',
          isAvailable: true,
          icon: () => (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ),
        },
      ],
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside className={`nlams-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-brand-wrapper">
          <div className="sidebar-brand-emblem" aria-hidden="true">
            <span className="emblem-saffron" />
            <span className="emblem-white" />
            <span className="emblem-green" />
          </div>
          <div className="sidebar-brand-content">
            <h1 className="sidebar-brand-title">NLAMS</h1>
            <p className="sidebar-brand-subtitle">Land Acquisition System</p>
          </div>
        </div>

        <div className="sidebar-nav-container">
          {navigation.map((group) => (
            <div key={group.groupName} className="nav-group-section">
              <h2 className="nav-group-title">{group.groupName}</h2>
              <ul className="nav-item-list">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;

                  if (!item.isAvailable) {
                    return (
                      <li key={item.name} className="nav-item-wrapper disabled">
                        <span className="nav-link-disabled" title="Coming Soon in later phase">
                          <span className="nav-icon">{item.icon({})}</span>
                          <span className="nav-text">{item.name}</span>
                          {item.badge && <span className="nav-badge-soon">{item.badge}</span>}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.name} className="nav-item-wrapper">
                      <Link
                        href={item.href}
                        className={`nav-link ${isActive ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="nav-icon">{item.icon({})}</span>
                        <span className="nav-text">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-system-version">
            <span>NLAMS v0.2.0 • Phase 3</span>
          </div>
        </div>
      </aside>
    </>
  );
};
