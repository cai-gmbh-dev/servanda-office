/**
 * ClauseReorderPanel — Sprint 12 (Team 04)
 *
 * Ermöglicht das Umsortieren von optionalen/alternativen Klauseln
 * innerhalb einer Section via Drag-and-Drop.
 *
 * Verwendet HTML5 Drag and Drop API (keine externe Library).
 * Nur "optional" und "alternative" Slots sind verschiebbar.
 * "required" Slots sind fix und nicht verschiebbar (visuell markiert).
 *
 * Props:
 * - sections: TemplateSection[] (aus Template-Structure)
 * - selectedSlots: Record<string, string> (aktuell gewählte Slots)
 * - onReorder: (sectionIndex: number, newOrder: string[]) => void
 */

import { useState, useRef, useCallback, CSSProperties } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TemplateSlot {
  clauseId: string;
  type: 'required' | 'optional' | 'alternative';
  alternativeClauseIds?: string[];
}

export interface TemplateSection {
  title: string;
  slots: TemplateSlot[];
}

interface ClauseReorderPanelProps {
  sections: TemplateSection[];
  selectedSlots: Record<string, string>;
  onReorder: (sectionIndex: number, newOrder: string[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Styles (inline)                                                    */
/* ------------------------------------------------------------------ */

const styles: Record<string, CSSProperties> = {
  panel: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  section: {
    marginBottom: '16px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    padding: '12px',
    backgroundColor: '#fafafa',
  },
  sectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    marginBottom: '8px',
    color: '#1a1a1a',
  },
  slotList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    minHeight: '32px',
  },
  slot: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    marginBottom: '4px',
    borderRadius: '4px',
    border: '1px solid #d0d0d0',
    backgroundColor: '#ffffff',
    cursor: 'grab',
    userSelect: 'none' as const,
    transition: 'background-color 0.15s, opacity 0.15s, box-shadow 0.15s',
  },
  slotDragging: {
    opacity: 0.4,
    backgroundColor: '#e8f0fe',
  },
  slotDragOver: {
    borderTop: '2px solid #1a73e8',
    paddingTop: '6px',
  },
  slotRequired: {
    cursor: 'default',
    backgroundColor: '#f5f5f5',
    borderStyle: 'dashed',
    color: '#666',
  },
  dragHandle: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#888',
    fontSize: '16px',
    lineHeight: 1,
    flexShrink: 0,
  },
  lockIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    color: '#999',
    fontSize: '14px',
    lineHeight: 1,
    flexShrink: 0,
  },
  clauseLabel: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  typeBadge: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '3px',
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    flexShrink: 0,
  },
  badgeRequired: {
    backgroundColor: '#e8e8e8',
    color: '#666',
  },
  badgeOptional: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32',
  },
  badgeAlternative: {
    backgroundColor: '#fff3e0',
    color: '#e65100',
  },
  liveRegion: {
    position: 'absolute' as const,
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap' as const,
    border: 0,
  },
  kbdHint: {
    fontSize: '11px',
    color: '#888',
    marginTop: '8px',
    paddingLeft: '4px',
  },
};

const TYPE_LABELS: Record<string, string> = {
  required: 'Pflicht',
  optional: 'Optional',
  alternative: 'Alternativ',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ClauseReorderPanel({
  sections,
  selectedSlots,
  onReorder,
}: ClauseReorderPanelProps) {
  // Per-section slot order state; initialised from props on first render
  const [sectionOrders, setSectionOrders] = useState<string[][]>(() =>
    sections.map((section) => section.slots.map((s) => s.clauseId)),
  );

  // Drag state
  const [dragSectionIdx, setDragSectionIdx] = useState<number | null>(null);
  const [dragSlotId, setDragSlotId] = useState<string | null>(null);
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);

  // Keyboard focus state
  const [focusedSection, setFocusedSection] = useState<number | null>(null);
  const [focusedSlotIdx, setFocusedSlotIdx] = useState<number | null>(null);

  // Live region announcement
  const [announcement, setAnnouncement] = useState('');
  const listRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  // Build a lookup from clauseId to slot definition
  const slotLookup = useCallback(
    (sectionIdx: number, clauseId: string): TemplateSlot | undefined => {
      return sections[sectionIdx]?.slots.find((s) => s.clauseId === clauseId);
    },
    [sections],
  );

  const isDraggable = useCallback(
    (sectionIdx: number, clauseId: string): boolean => {
      const slot = slotLookup(sectionIdx, clauseId);
      return slot ? slot.type !== 'required' : false;
    },
    [slotLookup],
  );

  /* ---- Drag & Drop handlers ---- */

  function handleDragStart(
    e: React.DragEvent<HTMLLIElement>,
    sectionIdx: number,
    clauseId: string,
  ) {
    if (!isDraggable(sectionIdx, clauseId)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', clauseId);
    setDragSectionIdx(sectionIdx);
    setDragSlotId(clauseId);
  }

  function handleDragOver(
    e: React.DragEvent<HTMLLIElement>,
    sectionIdx: number,
    clauseId: string,
  ) {
    // Only allow drop within the same section
    if (dragSectionIdx !== sectionIdx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlotId(clauseId);
  }

  function handleDragLeave() {
    setDragOverSlotId(null);
  }

  function handleDrop(
    e: React.DragEvent<HTMLLIElement>,
    sectionIdx: number,
    targetClauseId: string,
  ) {
    e.preventDefault();
    if (dragSectionIdx !== sectionIdx || !dragSlotId) return;
    if (dragSlotId === targetClauseId) {
      resetDragState();
      return;
    }

    const currentOrder = [...(sectionOrders[sectionIdx] ?? [])];
    const fromIndex = currentOrder.indexOf(dragSlotId);
    const toIndex = currentOrder.indexOf(targetClauseId);

    if (fromIndex === -1 || toIndex === -1) {
      resetDragState();
      return;
    }

    // Move the dragged item to the target position
    currentOrder.splice(fromIndex, 1);
    currentOrder.splice(toIndex, 0, dragSlotId);

    applyNewOrder(sectionIdx, currentOrder);
    resetDragState();
  }

  function handleDragEnd() {
    resetDragState();
  }

  function resetDragState() {
    setDragSectionIdx(null);
    setDragSlotId(null);
    setDragOverSlotId(null);
  }

  /* ---- Keyboard handlers ---- */

  function handleSlotKeyDown(
    e: React.KeyboardEvent<HTMLLIElement>,
    sectionIdx: number,
    slotIdx: number,
    clauseId: string,
  ) {
    const order = sectionOrders[sectionIdx];
    if (!order) return;

    if (e.key === 'ArrowUp' && e.altKey) {
      e.preventDefault();
      if (!isDraggable(sectionIdx, clauseId)) return;
      if (slotIdx <= 0) return;

      // Find the nearest non-required slot above to swap with
      const newOrder = [...order];
      const targetIdx = slotIdx - 1;
      const targetClauseId = newOrder[targetIdx];

      // Swap positions
      newOrder[slotIdx] = targetClauseId;
      newOrder[targetIdx] = clauseId;

      applyNewOrder(sectionIdx, newOrder);
      setFocusedSection(sectionIdx);
      setFocusedSlotIdx(targetIdx);

      // Focus the element at new position
      requestAnimationFrame(() => {
        const key = `${sectionIdx}-${targetIdx}`;
        const el = listRefs.current.get(key);
        el?.focus();
      });

      const slot = slotLookup(sectionIdx, clauseId);
      setAnnouncement(
        `${slot?.clauseId ?? clauseId} nach oben verschoben, Position ${targetIdx + 1} von ${order.length}`,
      );
    } else if (e.key === 'ArrowDown' && e.altKey) {
      e.preventDefault();
      if (!isDraggable(sectionIdx, clauseId)) return;
      if (slotIdx >= order.length - 1) return;

      const newOrder = [...order];
      const targetIdx = slotIdx + 1;
      const targetClauseId = newOrder[targetIdx];

      newOrder[slotIdx] = targetClauseId;
      newOrder[targetIdx] = clauseId;

      applyNewOrder(sectionIdx, newOrder);
      setFocusedSection(sectionIdx);
      setFocusedSlotIdx(targetIdx);

      requestAnimationFrame(() => {
        const key = `${sectionIdx}-${targetIdx}`;
        const el = listRefs.current.get(key);
        el?.focus();
      });

      const slot = slotLookup(sectionIdx, clauseId);
      setAnnouncement(
        `${slot?.clauseId ?? clauseId} nach unten verschoben, Position ${targetIdx + 1} von ${order.length}`,
      );
    } else if (e.key === 'ArrowUp' && !e.altKey) {
      e.preventDefault();
      if (slotIdx > 0) {
        setFocusedSlotIdx(slotIdx - 1);
        requestAnimationFrame(() => {
          const key = `${sectionIdx}-${slotIdx - 1}`;
          const el = listRefs.current.get(key);
          el?.focus();
        });
      }
    } else if (e.key === 'ArrowDown' && !e.altKey) {
      e.preventDefault();
      if (slotIdx < order.length - 1) {
        setFocusedSlotIdx(slotIdx + 1);
        requestAnimationFrame(() => {
          const key = `${sectionIdx}-${slotIdx + 1}`;
          const el = listRefs.current.get(key);
          el?.focus();
        });
      }
    }
  }

  /* ---- Apply new order ---- */

  function applyNewOrder(sectionIdx: number, newOrder: string[]) {
    setSectionOrders((prev) => {
      const next = [...prev];
      next[sectionIdx] = newOrder;
      return next;
    });
    onReorder(sectionIdx, newOrder);
  }

  /* ---- Render helpers ---- */

  function getSlotStyle(
    sectionIdx: number,
    clauseId: string,
  ): CSSProperties {
    const base = { ...styles.slot };
    const slot = slotLookup(sectionIdx, clauseId);

    if (slot?.type === 'required') {
      Object.assign(base, styles.slotRequired);
    }
    if (dragSlotId === clauseId && dragSectionIdx === sectionIdx) {
      Object.assign(base, styles.slotDragging);
    }
    if (dragOverSlotId === clauseId && dragSectionIdx === sectionIdx && dragSlotId !== clauseId) {
      Object.assign(base, styles.slotDragOver);
    }

    return base;
  }

  function getTypeBadgeStyle(type: string): CSSProperties {
    const base = { ...styles.typeBadge };
    if (type === 'required') Object.assign(base, styles.badgeRequired);
    else if (type === 'optional') Object.assign(base, styles.badgeOptional);
    else if (type === 'alternative') Object.assign(base, styles.badgeAlternative);
    return base;
  }

  function setListRef(key: string, el: HTMLLIElement | null) {
    if (el) {
      listRefs.current.set(key, el);
    } else {
      listRefs.current.delete(key);
    }
  }

  /* ---- Render ---- */

  return (
    <div style={styles.panel} data-testid="clause-reorder-panel">
      <h3>Klausel-Reihenfolge</h3>

      {/* ARIA Live Region for reorder announcements */}
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        style={styles.liveRegion}
        data-testid="reorder-announcement"
      >
        {announcement}
      </div>

      {sections.map((section, sectionIdx) => {
        const order = sectionOrders[sectionIdx] ?? section.slots.map((s) => s.clauseId);

        return (
          <div key={sectionIdx} style={styles.section}>
            <h4 style={styles.sectionTitle}>
              {'\u00A7'} {sectionIdx + 1} {section.title}
            </h4>

            <ul
              role="listbox"
              aria-label={`Klauseln in ${section.title}`}
              style={styles.slotList}
              data-testid={`section-${sectionIdx}-slots`}
            >
              {order.map((clauseId, slotIdx) => {
                const slot = slotLookup(sectionIdx, clauseId);
                if (!slot) return null;

                const draggable = isDraggable(sectionIdx, clauseId);
                const refKey = `${sectionIdx}-${slotIdx}`;
                const isSelected = selectedSlots[clauseId] !== undefined;
                const isFocused =
                  focusedSection === sectionIdx && focusedSlotIdx === slotIdx;

                return (
                  <li
                    key={clauseId}
                    ref={(el) => setListRef(refKey, el)}
                    role="option"
                    aria-selected={isSelected}
                    aria-grabbed={draggable ? (dragSlotId === clauseId) : undefined}
                    aria-label={`${clauseId} (${TYPE_LABELS[slot.type] ?? slot.type})${!draggable ? ', nicht verschiebbar' : ''}`}
                    tabIndex={isFocused || (focusedSection === null && sectionIdx === 0 && slotIdx === 0) ? 0 : -1}
                    draggable={draggable}
                    style={getSlotStyle(sectionIdx, clauseId)}
                    onDragStart={(e) => handleDragStart(e, sectionIdx, clauseId)}
                    onDragOver={(e) => handleDragOver(e, sectionIdx, clauseId)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, sectionIdx, clauseId)}
                    onDragEnd={handleDragEnd}
                    onKeyDown={(e) => handleSlotKeyDown(e, sectionIdx, slotIdx, clauseId)}
                    onFocus={() => {
                      setFocusedSection(sectionIdx);
                      setFocusedSlotIdx(slotIdx);
                    }}
                  >
                    {/* Drag handle or lock icon */}
                    {draggable ? (
                      <span style={styles.dragHandle} aria-hidden="true" title="Verschieben">
                        &#8942;&#8942;
                      </span>
                    ) : (
                      <span style={styles.lockIcon} aria-hidden="true" title="Nicht verschiebbar">
                        &#128274;
                      </span>
                    )}

                    {/* Clause ID label */}
                    <span style={styles.clauseLabel}>{clauseId}</span>

                    {/* Type badge */}
                    <span style={getTypeBadgeStyle(slot.type)}>
                      {TYPE_LABELS[slot.type] ?? slot.type}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p style={styles.kbdHint} aria-hidden="true">
              <kbd>Alt+&#8593;</kbd>/<kbd>Alt+&#8595;</kbd> zum Verschieben
              &middot; <kbd>&#8593;</kbd>/<kbd>&#8595;</kbd> zum Navigieren
            </p>
          </div>
        );
      })}
    </div>
  );
}
