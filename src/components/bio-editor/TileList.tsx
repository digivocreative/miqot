import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import TileRow from './TileRow';
import type { BioTile } from '../bio/types';

interface Props {
  tiles: BioTile[];
  onReorder: (orderedIds: string[]) => void;
  onTapTile: (tile: BioTile) => void;
  onToggleVisible: (tile: BioTile) => void;
  agentPhone?: string;
}

export default function TileList({ tiles, onReorder, onTapTile, onToggleVisible, agentPhone }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const sorted = [...tiles].sort((a, b) => a.order - b.order);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex(t => t.id === active.id);
    const newIndex = sorted.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    onReorder(reordered.map(t => t.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {sorted.map(tile => (
            <TileRow
              key={tile.id}
              tile={tile}
              agentPhone={agentPhone}
              onTap={() => onTapTile(tile)}
              onToggleVisible={() => onToggleVisible(tile)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
