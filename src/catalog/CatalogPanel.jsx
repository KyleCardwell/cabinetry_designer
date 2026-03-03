import { useDispatch, useSelector } from 'react-redux';
import { addObject } from '../store/slices/objectSlice';
import { CATALOG_ITEMS } from './catalogData';

export default function CatalogPanel() {
  const dispatch = useDispatch();
  const room = useSelector((state) => state.room.current);
  const walls = useSelector((state) => state.walls);
  const { selectedIds, selectionType } = useSelector((state) => state.canvas);

  const hasWalls = walls.allIds.length > 0;
  // Use the selected wall if one is selected, otherwise use the first wall
  const targetWallId =
    selectionType === 'wall' && selectedIds.length === 1
      ? selectedIds[0]
      : walls.allIds[0] || null;

  const handleAdd = (item) => {
    if (!targetWallId) return;
    dispatch(addObject({
      roomId: room?.room_id,
      wallId: targetWallId,
      objectType: item.object_type,
      catalogId: item.catalog_id,
      x: 0,
      y: 0,
      width: item.defaultWidth,
      height: item.defaultHeight,
      depth: item.defaultDepth,
      params: { ...item.defaultParams },
      fillColor: item.fillColor,
      borderColor: item.borderColor,
    }));
  };

  return (
    <div className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-700">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Catalog</h3>
      </div>

      {!hasWalls && (
        <div className="px-3 py-4 text-xs text-gray-500 text-center">
          Draw at least one wall before placing objects.
        </div>
      )}

      {hasWalls && targetWallId && (
        <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700">
          Placing on: <span className="text-blue-400 font-medium">
            {selectionType === 'wall' && selectedIds[0] === targetWallId
              ? 'Selected wall'
              : 'Wall 1'}
          </span>
        </div>
      )}

      <div className="p-2 space-y-1">
        {CATALOG_ITEMS.map((item) => (
          <button
            key={item.catalog_id}
            onClick={() => handleAdd(item)}
            disabled={!hasWalls}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              hasWalls
                ? 'bg-gray-750 hover:bg-gray-700'
                : 'bg-gray-750 opacity-40 cursor-not-allowed'
            }`}
          >
            <div className="font-medium text-gray-200">{item.label}</div>
            <div className="text-xs text-gray-500">
              {item.defaultWidth}&times;{item.defaultHeight}&times;{item.defaultDepth}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
