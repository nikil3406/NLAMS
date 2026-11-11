import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '../../../../lib/auth';
import { authorizationService } from '../../../../services/authorization';
import { InventoryDetailClient } from './inventory-detail-client';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: 'Inventory Details | NLAMS',
  description: 'National Land Acquisition and Management System — Verified Land Inventory Details',
};

export default async function InventoryDetailPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;

  const authContext = await authorizationService.getUserAuthorizationContext(user.id);
  const userPermissions = authContext?.permissions ?? [];
  const userRoles = authContext?.roles ?? [];
  const isSuperAdmin = authContext?.isSuperAdmin ?? false;

  return (
    <InventoryDetailClient
      inventoryId={id}
      userPermissions={userPermissions}
      userRoles={userRoles}
      isSuperAdmin={isSuperAdmin}
      currentUserId={user.id}
    />
  );
}

