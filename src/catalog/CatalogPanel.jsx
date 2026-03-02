import { useDispatch, useSelector } from 'react-redux';
import { addObject } from '../store/slices/objectSlice';
import { CATALOG_ITEMS } from './catalogData';

export default function CatalogPanel() {
  const dispatch = useDispatch();
  const room = useSelector((state) => state.room.current);

  const handleAdd = (item) => {
    dispatch(addObject({
      roomId: room?.room_id,
      objectType: item.object_type,
      catalogId: item.catalog_id,
      x: 60,  // default placement near center
      y: 60,
      width: item.defaultWidth,
      height: item.defaultHeight,
      depth: item.defaultDepth,
      params: { ...item.defaultParams },
    }));
  };

  return (
    <div className="w-56 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0 overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-700">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Catalog</h3>
      </div>
      <div className="p-2 space-y-1">
        {CATALOG_ITEMS.map((item) => (
          <button
            key={item.catalog_id}
            onClick={() => handleAdd(item)}
            className="w-full text-left px-3 py-2 rounded text-sm bg-gray-750 hover:bg-gray-700 transition-colors"
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
