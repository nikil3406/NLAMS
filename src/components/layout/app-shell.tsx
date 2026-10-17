'use client';

import React, { useState } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';
import type { BreadcrumbItem } from './breadcrumb';
import type { SafeUser } from '../../types/auth';

interface AppShellProps {
  user: SafeUser;
  roles?: string[];
  scopeName?: string;
  breadcrumbs?: BreadcrumbItem[];
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  user,
  roles = [],
  scopeName,
  breadcrumbs = [],
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="nlams-app-shell">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="nlams-main-layout">
        <Header
          user={user}
          roles={roles}
          scopeName={scopeName}
          breadcrumbs={breadcrumbs}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          isSidebarOpen={isSidebarOpen}
        />

        <main className="nlams-content-container">
          {children}
        </main>
      </div>
    </div>
  );
};
