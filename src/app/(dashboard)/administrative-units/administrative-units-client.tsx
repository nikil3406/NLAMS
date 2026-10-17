'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { AdministrativeUnitTreeNode } from '../../../services/administrative-units';
import type { AdministrativeUnit } from '../../../../db/schema/administrative-units';

interface UnitDetailsResponse extends AdministrativeUnit {
  status: 'ACTIVE' | 'INACTIVE';
  ancestors: AdministrativeUnit[];
  directChildrenCount: number;
  totalDescendantsCount: number;
}

interface AdministrativeUnitsClientProps {
  userPermissions: string[];
  isSuperAdmin: boolean;
}

export function AdministrativeUnitsClient({
  userPermissions,
  isSuperAdmin,
}: AdministrativeUnitsClientProps) {
  const canCreate = isSuperAdmin || userPermissions.includes('ADMIN_UNIT_CREATE');
  const canUpdate = isSuperAdmin || userPermissions.includes('ADMIN_UNIT_UPDATE');

  const [treeData, setTreeData] = useState<AdministrativeUnitTreeNode[]>([]);
  const [flatUnits, setFlatUnits] = useState<AdministrativeUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<UnitDetailsResponse | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  // Create Form State
  const [createName, setCreateName] = useState('');
  const [createCode, setCreateCode] = useState('');
  const [createType, setCreateType] = useState('DISTRICT');
  const [createParentId, setCreateParentId] = useState<string>('');
  const [createStatus, setCreateStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Form State
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editType, setEditType] = useState('');
  const [editParentId, setEditParentId] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Fetch Tree & Flat Units
  const loadHierarchyData = useCallback(async () => {
    setIsLoadingTree(true);
    setErrorMessage(null);
    try {
      const [treeRes, flatRes] = await Promise.all([
        fetch('/api/administrative-units?tree=true'),
        fetch('/api/administrative-units'),
      ]);

      if (!treeRes.ok) {
        if (treeRes.status === 403) {
          throw new Error('You do not have permission to view administrative units.');
        }
        throw new Error('Failed to load administrative hierarchy.');
      }

      const treeJson = await treeRes.json();
      const flatJson = await flatRes.json();

      if (treeJson.success) {
        setTreeData(treeJson.data);
        // Expand root nodes by default
        const initialExpanded = new Set<string>();
        treeJson.data.forEach((node: AdministrativeUnitTreeNode) => {
          initialExpanded.add(node.id);
          // Also expand first level children for better immediate UX
          node.children?.forEach((c) => initialExpanded.add(c.id));
        });
        setExpandedIds(initialExpanded);

        // Select first unit by default if none selected
        if (!selectedUnitId && treeJson.data.length > 0) {
          setSelectedUnitId(treeJson.data[0].id);
        }
      }

      if (flatJson.success) {
        setFlatUnits(flatJson.data);
      }
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Unable to connect to hierarchy service.');
    } finally {
      setIsLoadingTree(false);
    }
  }, [selectedUnitId]);

  useEffect(() => {
    loadHierarchyData();
  }, [loadHierarchyData]);

  // Load Unit Details when selected
  useEffect(() => {
    if (!selectedUnitId) {
      setSelectedDetails(null);
      return;
    }

    let isMounted = true;
    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      try {
        const res = await fetch(`/api/administrative-units/${selectedUnitId}`);
        if (!res.ok) {
          throw new Error('Failed to load unit details');
        }
        const json = await res.json();
        if (isMounted && json.success) {
          setSelectedDetails(json.data);
        }
      } catch (err) {
        console.error('Error fetching details:', err);
      } finally {
        if (isMounted) setIsLoadingDetails(false);
      }
    };

    fetchDetails();
    return () => {
      isMounted = false;
    };
  }, [selectedUnitId]);

  // Toggle tree node expansion
  const toggleExpand = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    const recurse = (nodes: AdministrativeUnitTreeNode[]) => {
      nodes.forEach((n) => {
        allIds.add(n.id);
        if (n.children) recurse(n.children);
      });
    };
    recurse(treeData);
    setExpandedIds(allIds);
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Open Create Modal
  const handleOpenCreateModal = (suggestedParentId?: string) => {
    setCreateName('');
    setCreateCode('');
    setCreateType('DISTRICT');
    setCreateParentId(suggestedParentId ?? (selectedUnitId || ''));
    setCreateStatus('ACTIVE');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = () => {
    if (!selectedDetails) return;
    setEditName(selectedDetails.name);
    setEditCode(selectedDetails.code);
    setEditType(selectedDetails.type);
    setEditParentId(selectedDetails.parentId || '');
    setEditStatus(selectedDetails.isActive ? 'ACTIVE' : 'INACTIVE');
    setEditError(null);
    setIsEditOpen(true);
  };

  // Handle Create Unit Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCreateError(null);
    setCreateSubmitting(true);

    try {
      const payload: {
        name: string;
        code: string;
        type: string;
        parentId?: string | null;
        status: 'ACTIVE' | 'INACTIVE';
      } = {
        name: createName.trim(),
        code: createCode.trim().toUpperCase(),
        type: createType.trim().toUpperCase(),
        status: createStatus,
      };

      if (createParentId && createParentId.trim()) {
        payload.parentId = createParentId;
      } else {
        payload.parentId = null;
      }

      const res = await fetch('/api/administrative-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setCreateError(data.error || 'Failed to create administrative unit.');
        setCreateSubmitting(false);
        return;
      }

      setIsCreateOpen(false);
      setActionSuccessMessage(`Administrative unit "${data.data.name}" created successfully.`);
      setTimeout(() => setActionSuccessMessage(null), 5000);

      // Reload hierarchy & select new unit
      await loadHierarchyData();
      setSelectedUnitId(data.data.id);
    } catch (err: unknown) {
      setCreateError((err as Error).message || 'Unexpected connection error');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Edit Unit Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedDetails) return;

    setEditError(null);
    setEditSubmitting(true);

    try {
      const payload: {
        name?: string;
        code?: string;
        type?: string;
        parentId?: string | null;
        status?: 'ACTIVE' | 'INACTIVE';
      } = {
        name: editName.trim(),
        code: editCode.trim().toUpperCase(),
        type: editType.trim().toUpperCase(),
        status: editStatus,
        parentId: editParentId && editParentId.trim() ? editParentId : null,
      };

      const res = await fetch(`/api/administrative-units/${selectedDetails.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setEditError(data.error || 'Failed to update administrative unit.');
        setEditSubmitting(false);
        return;
      }

      setIsEditOpen(false);
      setActionSuccessMessage(`Administrative unit "${data.data.name}" updated successfully.`);
      setTimeout(() => setActionSuccessMessage(null), 5000);

      // Reload hierarchy & refresh details
      await loadHierarchyData();
      const refetched = await fetch(`/api/administrative-units/${selectedDetails.id}`);
      if (refetched.ok) {
        const refetchedJson = await refetched.json();
        if (refetchedJson.success) {
          setSelectedDetails(refetchedJson.data);
        }
      }
    } catch (err: unknown) {
      setEditError((err as Error).message || 'Unexpected connection error');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Filter tree based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return treeData;
    const query = searchQuery.toLowerCase().trim();

    const matchesQuery = (node: AdministrativeUnitTreeNode): boolean => {
      return (
        node.name.toLowerCase().includes(query) ||
        node.code.toLowerCase().includes(query) ||
        node.type.toLowerCase().includes(query)
      );
    };

    const filterNodes = (
      nodes: AdministrativeUnitTreeNode[]
    ): AdministrativeUnitTreeNode[] => {
      const result: AdministrativeUnitTreeNode[] = [];
      for (const node of nodes) {
        const selfMatch = matchesQuery(node);
        const filteredChildren = filterNodes(node.children || []);
        if (selfMatch || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren,
          });
        }
      }
      return result;
    };

    return filterNodes(treeData);
  }, [treeData, searchQuery]);

  // Candidates for valid new parents when editing (prevent circular selection)
  const validEditParents = useMemo(() => {
    if (!selectedDetails) return flatUnits;

    // A unit cannot select itself or any of its descendants as parent
    const invalidIds = new Set<string>([selectedDetails.id]);

    const collectDescendantIds = (node: AdministrativeUnitTreeNode) => {
      if (node.id === selectedDetails.id) {
        const markSubtree = (n: AdministrativeUnitTreeNode) => {
          invalidIds.add(n.id);
          n.children?.forEach(markSubtree);
        };
        node.children?.forEach(markSubtree);
      } else {
        node.children?.forEach(collectDescendantIds);
      }
    };

    treeData.forEach(collectDescendantIds);

    return flatUnits.filter((u) => !invalidIds.has(u.id));
  }, [selectedDetails, flatUnits, treeData]);

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: AdministrativeUnitTreeNode, depth = 0) => {
    const isSelected = selectedUnitId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);

    return (
      <div key={node.id} className="tree-node-group">
        <div
          className={`tree-node-row ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => setSelectedUnitId(node.id)}
          role="treeitem"
          aria-selected={isSelected}
        >
          {hasChildren ? (
            <button
              className="tree-expand-btn"
              onClick={(e) => toggleExpand(node.id, e)}
              aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
            >
              <svg
                className={`tree-chevron ${isExpanded ? 'expanded' : ''}`}
                width="14"
                height="14"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          ) : (
            <span className="tree-leaf-spacer" aria-hidden="true" />
          )}

          <span className={`tree-type-badge type-${node.type.toLowerCase()}`}>
            {node.type}
          </span>

          <span className="tree-node-name">{node.name}</span>
          <span className="tree-node-code">({node.code})</span>

          {node.childCount > 0 && (
            <span className="tree-children-count" title={`${node.childCount} direct children`}>
              {node.childCount}
            </span>
          )}

          {!node.isActive && (
            <span className="badge-inactive-pill">Inactive</span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="tree-children-container" role="group">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="administrative-units-page">
      {/* Page Title & Global Actions */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Administrative Hierarchy</h1>
          <p className="page-subtitle">
            Arbitrary-depth data-driven administrative units, state boundaries, and jurisdictional divisions
          </p>
        </div>

        <div className="page-actions-group">
          {canCreate ? (
            <button
              id="create-unit-btn"
              className="btn-primary"
              onClick={() => handleOpenCreateModal()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Administrative Unit</span>
            </button>
          ) : (
            <span className="view-only-tag">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>View-Only Access</span>
            </span>
          )}
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="alert-success-banner" role="status">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="alert-error-banner" role="alert">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Dual-Column Panel */}
      <div className="hierarchy-dual-layout">
        {/* Left Column: Interactive Tree Explorer */}
        <section className="tree-panel-card" aria-label="Administrative Units Tree">
          <div className="tree-panel-header">
            <div className="tree-search-wrapper">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="hierarchy-search-input"
                type="text"
                className="search-input"
                placeholder="Search unit name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="tree-controls-group">
              <button
                className="btn-tree-control"
                onClick={expandAll}
                title="Expand All Nodes"
              >
                Expand All
              </button>
              <button
                className="btn-tree-control"
                onClick={collapseAll}
                title="Collapse All Nodes"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="tree-panel-body" role="tree">
            {isLoadingTree ? (
              <div className="tree-loading-state">
                <span className="spinner" />
                <p>Loading administrative hierarchy from database...</p>
              </div>
            ) : filteredTree.length === 0 ? (
              <div className="tree-empty-state">
                <p className="empty-title">No administrative units found</p>
                <p className="empty-desc">
                  {searchQuery
                    ? `No matches found for "${searchQuery}".`
                    : 'No administrative units exist within your administrative scope.'}
                </p>
              </div>
            ) : (
              <div className="tree-nodes-list">
                {filteredTree.map((node) => renderTreeNode(node, 0))}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Selected Unit Detail Panel */}
        <section className="detail-panel-card" aria-label="Unit Details and Relationships">
          {isLoadingDetails ? (
            <div className="detail-loading-state">
              <span className="spinner" />
              <p>Resolving unit details and ancestors...</p>
            </div>
          ) : !selectedDetails ? (
            <div className="detail-empty-state">
              <div className="empty-icon-box">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                </svg>
              </div>
              <h3 className="empty-title">Select an Administrative Unit</h3>
              <p className="empty-desc">
                Choose any administrative unit from the hierarchy tree on the left to inspect
                its scope, ancestors, child units, and actions.
              </p>
            </div>
          ) : (
            <div className="unit-details-content">
              {/* Unit Header */}
              <div className="unit-details-header">
                <div className="unit-title-group">
                  <span className={`detail-type-badge type-${selectedDetails.type.toLowerCase()}`}>
                    {selectedDetails.type}
                  </span>
                  <h2 className="unit-heading">{selectedDetails.name}</h2>
                  <span className="unit-code-badge">{selectedDetails.code}</span>
                </div>

                <div className="unit-header-actions">
                  {canUpdate && (
                    <button
                      id="edit-unit-btn"
                      className="btn-secondary"
                      onClick={handleOpenEditModal}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>Edit Unit</span>
                    </button>
                  )}

                  {canCreate && (
                    <button
                      id="add-subordinate-btn"
                      className="btn-accent"
                      onClick={() => handleOpenCreateModal(selectedDetails.id)}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      <span>Add Subordinate Unit</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Hierarchy Breadcrumb / Ancestor Path */}
              <div className="hierarchy-path-box">
                <span className="path-label">Hierarchy Relationship Path:</span>
                <div className="path-breadcrumbs">
                  {selectedDetails.ancestors && selectedDetails.ancestors.length > 0 ? (
                    <>
                      {selectedDetails.ancestors.map((anc) => (
                        <span key={anc.id} className="path-item">
                          <button
                            className="path-link-btn"
                            onClick={() => setSelectedUnitId(anc.id)}
                          >
                            {anc.name}
                          </button>
                          <span className="path-sep">→</span>
                        </span>
                      ))}
                      <span className="path-current">{selectedDetails.name}</span>
                    </>
                  ) : (
                    <span className="path-root-note">
                      Root Administrative Unit (Top of National Hierarchy)
                    </span>
                  )}
                </div>
              </div>

              {/* Information Grid */}
              <div className="details-grid-card">
                <div className="grid-cell">
                  <span className="cell-label">Unit Status</span>
                  <span className={`cell-status-pill ${selectedDetails.isActive ? 'active' : 'inactive'}`}>
                    <span className="status-dot" />
                    {selectedDetails.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid-cell">
                  <span className="cell-label">Hierarchy Level / Type</span>
                  <span className="cell-value">{selectedDetails.type}</span>
                </div>

                <div className="grid-cell">
                  <span className="cell-label">Direct Subordinates</span>
                  <span className="cell-value-highlight">
                    {selectedDetails.directChildrenCount} child units
                  </span>
                </div>

                <div className="grid-cell">
                  <span className="cell-label">Total Subordinate Network</span>
                  <span className="cell-value-highlight">
                    {selectedDetails.totalDescendantsCount} descendants
                  </span>
                </div>

                <div className="grid-cell">
                  <span className="cell-label">System Unique Code</span>
                  <span className="cell-code">{selectedDetails.code}</span>
                </div>

                <div className="grid-cell">
                  <span className="cell-label">Primary Key Identifier</span>
                  <span className="cell-uuid">{selectedDetails.id}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* CREATE UNIT MODAL */}
      {isCreateOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Create Administrative Unit</h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="modal-alert-error" role="alert">
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="create-name" className="form-label">
                  Unit Name *
                </label>
                <input
                  id="create-name"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Karnataka or Mysuru District"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="create-code" className="form-label">
                    Unit Code * (Unique)
                  </label>
                  <input
                    id="create-code"
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. KA-MYS"
                    value={createCode}
                    onChange={(e) => setCreateCode(e.target.value)}
                  />
                  <span className="form-hint">Alphanumeric, hyphens, and underscores</span>
                </div>

                <div className="form-group">
                  <label htmlFor="create-type" className="form-label">
                    Unit Type *
                  </label>
                  <select
                    id="create-type"
                    required
                    className="form-select"
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                  >
                    <option value="STATE">STATE</option>
                    <option value="DISTRICT">DISTRICT</option>
                    <option value="TALUK">TALUK</option>
                    <option value="VILLAGE">VILLAGE</option>
                    <option value="CENTRAL">CENTRAL</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="create-parent" className="form-label">
                  Parent Administrative Unit
                </label>
                <select
                  id="create-parent"
                  className="form-select"
                  value={createParentId}
                  onChange={(e) => setCreateParentId(e.target.value)}
                >
                  <option value="">None (Top-Level Root Unit)</option>
                  {flatUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code}) — {u.type}
                    </option>
                  ))}
                </select>
                <span className="form-hint">
                  Selected unit will be immediate superior in the hierarchy.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="create-status" className="form-label">
                  Initial Status
                </label>
                <select
                  id="create-status"
                  className="form-select"
                  value={createStatus}
                  onChange={(e) => setCreateStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-create-unit-btn"
                  className="btn-primary"
                  disabled={createSubmitting}
                >
                  {createSubmitting ? 'Creating Unit...' : 'Create Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT UNIT MODAL */}
      {isEditOpen && selectedDetails && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h2 className="modal-title">Edit Administrative Unit</h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsEditOpen(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="modal-alert-error" role="alert">
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="edit-name" className="form-label">
                  Unit Name *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  className="form-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label htmlFor="edit-code" className="form-label">
                    Unit Code *
                  </label>
                  <input
                    id="edit-code"
                    type="text"
                    required
                    className="form-input"
                    value={editCode}
                    onChange={(e) => setEditCode(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="edit-type" className="form-label">
                    Unit Type *
                  </label>
                  <select
                    id="edit-type"
                    required
                    className="form-select"
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                  >
                    <option value="CENTRAL">CENTRAL</option>
                    <option value="STATE">STATE</option>
                    <option value="DISTRICT">DISTRICT</option>
                    <option value="TALUK">TALUK</option>
                    <option value="VILLAGE">VILLAGE</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="edit-parent" className="form-label">
                  Parent Administrative Unit
                </label>
                <select
                  id="edit-parent"
                  className="form-select"
                  value={editParentId}
                  onChange={(e) => setEditParentId(e.target.value)}
                >
                  <option value="">None (Top-Level Root Unit)</option>
                  {validEditParents.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.code}) — {u.type}
                    </option>
                  ))}
                </select>
                <span className="form-hint">
                  Descendants of this unit are automatically excluded to prevent circular hierarchies.
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="edit-status" className="form-label">
                  Status
                </label>
                <select
                  id="edit-status"
                  className="form-select"
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'ACTIVE' | 'INACTIVE')}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsEditOpen(false)}
                  disabled={editSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-edit-unit-btn"
                  className="btn-primary"
                  disabled={editSubmitting}
                >
                  {editSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
