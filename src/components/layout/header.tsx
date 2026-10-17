'use client';

import React from 'react';
import Link from 'next/link';
import { UserMenu } from './user-menu';
import { Breadcrumb, type BreadcrumbItem } from './breadcrumb';
import type { SafeUser } from '../../types/auth';

interface HeaderProps {
  user: SafeUser;
  roles?: string[];
  scopeName?: string;
  breadcrumbs?: BreadcrumbItem[];
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  roles = [],
  scopeName,
  breadcrumbs = [],
  onToggleSidebar,
  isSidebarOpen,
}) => {
  return (
    <header className="nlams-header">
      <div className="header-left">
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          aria-expanded={isSidebarOpen}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <div className="header-brand-mobile">
          <Link href="/dashboard" className="brand-link">
            <span className="brand-abbr">NLAMS</span>
          </Link>
        </div>

        {breadcrumbs.length > 0 && (
          <div className="header-breadcrumb-area">
            <Breadcrumb items={breadcrumbs} />
          </div>
        )}
      </div>

      <div className="header-right">
        <div className="header-status-badge">
          <span className="status-live-pulse" />
          <span className="status-text">Govt. of India Portal</span>
        </div>

        <UserMenu user={user} roles={roles} scopeName={scopeName} />
      </div>
    </header>
  );
};
