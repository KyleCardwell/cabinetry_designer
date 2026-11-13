import { Shape } from 'react-konva';
import { pullOutlines } from '../model/pullLayouts.js';
import { outlineGeometry } from './outlinePath.js';

export default function Pulls({ pulls, transform }) {
  return pulls.flatMap((entry) => pullOutlines(entry).map((outline, index) => (
    <Shape
      key={`${entry.partId}:${index}`}
      {...outlineGeometry(outline, transform)}
      stroke="#f1f5f9"
      strokeWidth={1}
      fillEnabled={false}
      listening={false}
    />
  )));
}
