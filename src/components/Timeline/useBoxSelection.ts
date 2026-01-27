import { useCallback, useState } from 'react';
import type { MitEvent } from '../../model/types';
import { useStore } from '../../store';
import { MS_PER_SEC } from '../../constants/time';
import { getSkillDefinition } from '../../data/skills';
import { MIT_COLUMN_PADDING, MIT_COLUMN_WIDTH } from './timelineUtils';

interface BoxSelectionState {
  isActive: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

interface UseBoxSelectionOptions {
  containerId: string;
  columnMap: Record<string, number>;
  mitEvents: MitEvent[];
  zoom: number;
  mitX: number;
  getMitColumnLeft: (columnIndex: number) => number;
  getMitColumnKey: (mit: MitEvent) => string;
  setSelectedMitIds: (ids: string[]) => void;
  setContextMenu: (position: { x: number; y: number } | null) => void;
  setEditingMitId: (id: string | null) => void;
}

export function useBoxSelection({
  containerId,
  columnMap,
  mitEvents,
  zoom,
  mitX,
  getMitColumnLeft,
  getMitColumnKey,
  setSelectedMitIds,
  setContextMenu,
  setEditingMitId,
}: UseBoxSelectionOptions) {
  const [boxSelection, setBoxSelection] = useState<BoxSelectionState>({
    isActive: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        e.target === e.currentTarget ||
        (e.target as HTMLElement).tagName === 'svg' ||
        (e.target as HTMLElement).id === containerId
      ) {
        e.preventDefault();
        setContextMenu(null);
        setEditingMitId(null);

        const containerEl = e.currentTarget;
        const rect = containerEl.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;

        setBoxSelection({
          isActive: true,
          startX,
          startY,
          endX: startX,
          endY: startY,
        });

        const handleWindowMouseMove = (wEvent: MouseEvent) => {
          const currentRect = containerEl.getBoundingClientRect();
          setBoxSelection((prev) => ({
            ...prev,
            endX: wEvent.clientX - currentRect.left,
            endY: wEvent.clientY - currentRect.top,
          }));
        };

        const handleWindowMouseUp = (wEvent: MouseEvent) => {
          window.removeEventListener('mousemove', handleWindowMouseMove);
          window.removeEventListener('mouseup', handleWindowMouseUp);

          const currentRect = containerEl.getBoundingClientRect();
          const endX = wEvent.clientX - currentRect.left;
          const endY = wEvent.clientY - currentRect.top;

          const selectionRect = {
            left: Math.min(startX, endX),
            top: Math.min(startY, endY),
            right: Math.max(startX, endX),
            bottom: Math.max(startY, endY),
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
            const effectHeight = (mit.durationMs / MS_PER_SEC) * zoom;
            const skillDef = getSkillDefinition(mit.skillId);
            const cooldownMs = (skillDef?.cooldownSec ?? 0) * MS_PER_SEC;
            const cooldownHeight = (cooldownMs / MS_PER_SEC) * zoom;
            const height = 40 + effectHeight + cooldownHeight;

            if (
              left >= selectionRect.left &&
              left + width <= selectionRect.right &&
              top >= selectionRect.top &&
              top + height <= selectionRect.bottom
            ) {
              newlySelectedIds.push(mit.id);
            }
          });

          if (wEvent.ctrlKey || wEvent.metaKey) {
            const currentSelected = useStore.getState().selectedMitIds;
            setSelectedMitIds([...new Set([...currentSelected, ...newlySelectedIds])]);
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
        };

        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
      }
    },
    [
      columnMap,
      containerId,
      getMitColumnKey,
      getMitColumnLeft,
      mitEvents,
      mitX,
      setContextMenu,
      setEditingMitId,
      setSelectedMitIds,
      zoom,
    ],
  );

  return { boxSelection, handleMouseDown };
}
