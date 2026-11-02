// Indices físicos de un carrusel con copias a ambos extremos.
// Solo se salta cuando el scroll termina; las copias son visualmente idénticas.
export function resolveLoopIndex(index: number, postCount: number, cloneCount: number): number {
  if (postCount <= 1 || cloneCount === 0) return index;
  if (index < cloneCount) return index + postCount;
  if (index >= cloneCount + postCount) return index - postCount;
  return index;
}
