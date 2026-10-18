'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SafeUser } from '../../types/auth';

interface UserMenuProps {
  user: SafeUser;
  roles?: string[];
  scopeName?: string;
}

export const UserMenu: React.FC<UserMenuProps> = ({ user, roles = [], scopeName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
      router.push('/login');
    }
  };

  const primaryRole = roles[0] ? roles[0].replace('_', ' ') : 'OFFICER';
  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        id="user-menu-button"
        className="user-menu-button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User navigation menu"
      >
        <div className="user-avatar" aria-hidden="true">
          {initials}
        </div>
        <div className="user-info-text">
          <span className="user-display-name">{user.name}</span>
          <span className="user-role-badge">{primaryRole}</span>
        </div>
        <svg
          className={`user-chevron ${isOpen ? 'open' : ''}`}
          width="16"
          height="16"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="user-dropdown-panel" role="menu" aria-orientation="vertical">
          <div className="dropdown-user-header">
            <p className="dropdown-user-name">{user.name}</p>
            <p className="dropdown-user-email">{user.email}</p>
            {scopeName && (
              <div className="dropdown-scope-badge">
                <span className="scope-indicator-dot" />
                <span>Scope: {scopeName}</span>
              </div>
            )}
          </div>

          <div className="dropdown-divider" />

          <div className="dropdown-details-section">
            <div className="detail-row">
              <span className="detail-label">Role:</span>
              <span className="detail-value">{roles.join(', ') || 'Standard'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="detail-value status-active">{user.status}</span>
            </div>
          </div>

          <div className="dropdown-divider" />

          <Link
            href="/profile"
            id="dropdown-profile-link"
            className="dropdown-menu-item"
            role="menuitem"
            onClick={() => setIsOpen(false)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>My Profile</span>
          </Link>

          <div className="dropdown-divider" />

          <button
            id="logout-button"
            className="dropdown-logout-button"
            role="menuitem"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>{isLoggingOut ? 'Logging out...' : 'Sign out'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
