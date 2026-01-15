import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  onClose: () => void;
  position: { x: number; y: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ items, onClose, position }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const handleClickOutside = () => {
      setIsVisible(false);
      setTimeout(onClose, 150); // 延迟关闭以触发淡出动画
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [onClose]);

  // 计算位置，避免菜单超出屏幕
  const menuSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [menuSize, setMenuSize] = useState<{ width: number; height: number } | null>(null);
  const menuRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const nextSize = { width: rect.width, height: rect.height };
    const prevSize = menuSizeRef.current;

    if (!prevSize || prevSize.width !== nextSize.width || prevSize.height !== nextSize.height) {
      menuSizeRef.current = nextSize;
      setMenuSize(nextSize);
    }
  }, []);

  const adjustedPosition = useMemo(() => {
    if (!menuSize) return position;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    // 右侧溢出时向左回退
    if (position.x + menuSize.width > viewportWidth) {
      adjustedX = viewportWidth - menuSize.width - 5;
    }

    // 底部溢出时向上回退
    if (position.y + menuSize.height > viewportHeight) {
      adjustedY = viewportHeight - menuSize.height - 5;
    }

    // 防止超出左上边界
    adjustedX = Math.max(5, adjustedX);
    adjustedY = Math.max(5, adjustedY);

    return { x: adjustedX, y: adjustedY };
  }, [menuSize, position]);

  if (!isVisible) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[160px] max-w-xs"
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        transform: 'translateY(0)',
      }}
    >
      <ul className="divide-y divide-gray-700">
        {items.map((item, index) => (
          <li key={index}>
            <button
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition-colors ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-gray-200'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                item.onClick();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
