import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchRoom } from '../../store/slices/roomSlice';
import CanvasStage from '../../canvas/CanvasStage';
import CanvasToolbar from '../../canvas/CanvasToolbar';
import CatalogPanel from '../../catalog/CatalogPanel';
import PropertyPanel from '../properties/PropertyPanel';

export default function RoomEditor() {
  const { roomId } = useParams();
  const dispatch = useDispatch();
  const { current: room, loading } = useSelector((state) => state.room);

  useEffect(() => {
    if (roomId && roomId !== 'new') {
      dispatch(fetchRoom(roomId));
    }
  }, [dispatch, roomId]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading room...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Left sidebar: catalog */}
      <CatalogPanel />

      {/* Center: canvas */}
      <div className="flex-1 flex flex-col relative">
        <CanvasToolbar />
        <CanvasStage />
      </div>

      {/* Right sidebar: properties */}
      <PropertyPanel />
    </div>
  );
}
