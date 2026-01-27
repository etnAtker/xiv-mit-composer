import { useCallback, useRef, useState } from 'react';
import type { MitEvent } from '../../model/types';
import { MS_PER_SEC } from '../../constants/time';
import { getSkillDefinition } from '../../data/skills';
import { getMitigationBarHeights } from './mitigationBarUtils';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';

interface BoxSelectionState {
  isActive: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface UseBoxSelectionOptions {
  columnMap: Record<string, number>;
  mitEvents: MitEvent[];
  selectedMitIds: string[];
  zoom: number;
  mitX: number;
  getMitColumnLeft: (columnIndex: number) => number;
  getMitColumnKey: (mit: MitEvent) => string;
  setSelectedMitIds: (ids: string[]) => void;
  setContextMenu: (position: { x: number; y: number } | null) => void;
  setEditingMitId: (id: string | null) => void;
}

export function useBoxSelection({
  columnMap,
  mitEvents,
  selectedMitIds,
  zoom,
  mitX,
  getMitColumnLeft,
  getMitColumnKey,
  setSelectedMitIds,
  setContextMenu,
  setEditingMitId,
}: UseBoxSelectionOptions) {
  const activePointerIdRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const [boxSelection, setBoxSelection] = useState<BoxSelectionState>({
    isActive: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if (e.currentTarget.contains(e.target as Node)) {
        e.preventDefault();
        setContextMenu(null);
        setEditingMitId(null);

        const containerEl = e.currentTarget;
        const rect = containerEl.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;

        activePointerIdRef.current = e.pointerId;
        startPosRef.current = { x: startX, y: startY };

        try {
          containerEl.setPointerCapture(e.pointerId);
        } catch {
          // 捕获失败时依旧允许框选继续（不会中断逻辑）
        }

        setBoxSelection({
          isActive: true,
          startX,
          startY,
          endX: startX,
          endY: startY,
        });
      }
    },
    [setContextMenu, setEditingMitId],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== e.pointerId) return;
    if (!startPosRef.current) return;

    const containerEl = e.currentTarget;
    const currentRect = containerEl.getBoundingClientRect();
    setBoxSelection((prev) => ({
      ...prev,
      endX: e.clientX - currentRect.left,
      endY: e.clientY - currentRect.top,
    }));
  }, []);

  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, shouldCommit: boolean) => {
      if (activePointerIdRef.current !== e.pointerId) return;

      const containerEl = e.currentTarget;
      if (containerEl.hasPointerCapture(e.pointerId)) {
        containerEl.releasePointerCapture(e.pointerId);
      }

      activePointerIdRef.current = null;
      const startPos = startPosRef.current;
      startPosRef.current = null;

      if (!shouldCommit || !startPos) {
        setBoxSelection({
          isActive: false,
          startX: 0,
          startY: 0,
          endX: 0,
          endY: 0,
        });
        return;
      }

      const currentRect = containerEl.getBoundingClientRect();
      const endX = e.clientX - currentRect.left;
      const endY = e.clientY - currentRect.top;

      const selectionRect = {
        left: Math.min(startPos.x, endX),
        top: Math.min(startPos.y, endY),
        right: Math.max(startPos.x, endX),
        bottom: Math.max(startPos.y, endY),
      };

      const newlySelectedIds: string[] = [];
      const barWidth = MIT_COLUMN_WIDTH - MIT_COLUMN_PADDING * 2;
      mitEvents.forEach((mit) => {
        const columnKey = getMitColumnKey(mit);
        const columnIndex = columnMap[columnKey];
        if (columnIndex === undefined) return;
        const left = mitX + getMitColumnLeft(columnIndex) + MIT_COLUMN_PADDING;
        const top = (mit.tStartMs / MS_PER_SEC) * zoom;
        const width = barWidth;
        const skillDef = getSkillDefinition(mit.skillId);
        const { totalHeight } = getMitigationBarHeights(mit, zoom, skillDef);
        const height = totalHeight;

        if (
          left >= selectionRect.left &&
          left + width <= selectionRect.right &&
          top >= selectionRect.top &&
          top + height <= selectionRect.bottom
        ) {
          newlySelectedIds.push(mit.id);
        }
      });

      if (e.ctrlKey || e.metaKey) {
        setSelectedMitIds([...new Set([...selectedMitIds, ...newlySelectedIds])]);
      } else {
        setSelectedMitIds(newlySelectedIds);
      }

      setBoxSelection({
        isActive: false,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
      });
    },
    [
      columnMap,
      getMitColumnKey,
      getMitColumnLeft,
      mitEvents,
      mitX,
      selectedMitIds,
      setSelectedMitIds,
      zoom,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => handlePointerEnd(e, true),
    [handlePointerEnd],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => handlePointerEnd(e, false),
    [handlePointerEnd],
  );

  return {
    boxSelection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
}
