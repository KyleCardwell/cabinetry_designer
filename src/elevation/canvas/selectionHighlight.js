/**
 * What one run outlines (SPEC-39.1): only the selected thing. The run when the run itself is
 * selected, a piece when a piece is, a face when a face is; never the things it sits in.
 */
export function runHighlight(selectedRun, selectedPieceId = null, selectedFacePath = null) {
  if (!selectedRun) return { run: false, pieceId: null, facePath: null };
  if (!selectedPieceId) return { run: true, pieceId: null, facePath: null };
  if (selectedFacePath === null || selectedFacePath === undefined) {
    return { run: false, pieceId: selectedPieceId, facePath: null };
  }
  return { run: false, pieceId: null, facePath: selectedFacePath };
}
