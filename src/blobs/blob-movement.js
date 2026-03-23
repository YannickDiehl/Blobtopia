/**
 * Snap world-space coordinates to the nearest walkable grid cell using BFS.
 * @param {number} wx - world x
 * @param {number} wz - world z
 * @param {{grid: Uint8Array|Array, size: number, gridRes: number}} walkableGrid
 * @returns {{x: number, z: number}|null}
 */
export function snapToWalkable(wx, wz, walkableGrid){
  const { grid, size, gridRes } = walkableGrid
  const gx = Math.floor(wx / gridRes)
  const gz = Math.floor(wz / gridRes)
  // If already walkable, return immediately
  if (gx >= 0 && gx < size && gz >= 0 && gz < size && grid[gz * size + gx] > 0) {
    return { x: gx * gridRes + gridRes / 2, z: gz * gridRes + gridRes / 2 }
  }
  for (let r = 1; r <= 30; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const nx = gx + dx, nz = gz + dz
        if (nx >= 0 && nx < size && nz >= 0 && nz < size && grid[nz * size + nx] > 0) {
          return { x: nx * gridRes + gridRes / 2, z: nz * gridRes + gridRes / 2 }
        }
      }
    }
    for (let dz = -r + 1; dz < r; dz++) {
      for (const dx of [-r, r]) {
        const nx = gx + dx, nz = gz + dz
        if (nx >= 0 && nx < size && nz >= 0 && nz < size && grid[nz * size + nx] > 0) {
          return { x: nx * gridRes + gridRes / 2, z: nz * gridRes + gridRes / 2 }
        }
      }
    }
  }
  return null
}
