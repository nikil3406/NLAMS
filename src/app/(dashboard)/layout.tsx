import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../lib/auth';
import { authorizationService } from '../../services/authorization';
import { AppShell } from '../../components/layout/app-shell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const roles = authContext?.roles ?? [];

  let scopeName = 'Unassigned';
  if (authContext?.isSuperAdmin) {
    scopeName = 'National (System-Wide)';
  } else if (authContext?.assignments && authContext.assignments.length > 0) {
    scopeName = authContext.assignments
      .map((a) => `${a.administrativeUnitName} (${a.administrativeUnitType})`)
      .join(', ');
  }

  return (
    <AppShell
      user={user}
      roles={roles}
      scopeName={scopeName}
    >
      {children}
    </AppShell>
  );
}
