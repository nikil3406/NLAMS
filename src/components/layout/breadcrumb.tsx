'use client';

import React from 'react';
import Link from 'next/link';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  active?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav aria-label="Breadcrumb" className="nlams-breadcrumb">
      <ol className="breadcrumb-list">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="breadcrumb-item">
              {item.href && !isLast ? (
                <Link href={item.href} className="breadcrumb-link">
                  {item.label}
                </Link>
              ) : (
                <span className={`breadcrumb-current ${item.active ? 'active' : ''}`}>
                  {item.label}
                </span>
              )}
              {!isLast && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
