/**
 * pathfinder.js — Grid-based A* pathfinder for Blob movement.
 *
 * Works on the walkableGrid exported by city.js.
 * Returns waypoints in world coordinates that Blobs follow along roads.
 */

// Binary min-heap for fast open-set extraction
class MinHeap {
  constructor () {
    this._data = []
  }

  push (node) {
    this._data.push(node)
    this._bubbleUp(this._data.length - 1)
  }

  pop () {
    const top = this._data[0]
    const last = this._data.pop()
    if (this._data.length > 0) {
      this._data[0] = last
      this._sinkDown(0)
    }
    return top
  }

  get length () { return this._data.length }

  _bubbleUp (i) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this._data[i].f >= this._data[parent].f) break
      const tmp = this._data[parent]
      this._data[parent] = this._data[i]
      this._data[i] = tmp
      i = parent
    }
  }

  _sinkDown (i) {
    const n = this._data.length
    while (true) {
      let smallest = i
      const l = 2 * i + 1
      const r = 2 * i + 2
      if (l < n && this._data[l].f < this._data[smallest].f) smallest = l
      if (r < n && this._data[r].f < this._data[smallest].f) smallest = r
      if (smallest === i) break
      const tmp = this._data[smallest]
      this._data[smallest] = this._data[i]
      this._data[i] = tmp
      i = smallest
    }
  }
}

// 8-directional neighbors (cardinal + diagonal)
const DIRS = [
  { dx: 1, dz: 0, cost: 1 },
  { dx: -1, dz: 0, cost: 1 },
  { dx: 0, dz: 1, cost: 1 },
  { dx: 0, dz: -1, cost: 1 },
  { dx: 1, dz: 1, cost: 1.414 },
  { dx: -1, dz: 1, cost: 1.414 },
  { dx: 1, dz: -1, cost: 1.414 },
  { dx: -1, dz: -1, cost: 1.414 },
]

/**
 * Find a path on the walkable grid using A*.
 *
 * @param {number} startX - World X coordinate
 * @param {number} startZ - World Z coordinate
 * @param {number} endX   - World X coordinate
 * @param {number} endZ   - World Z coordinate
 * @param {{grid: Uint8Array, size: number, gridRes: number}} walkableGrid
 * @param {number} [maxSteps=2000] - Safety limit to prevent runaway searches
 * @returns {Array<{x: number, z: number}>} Waypoints in world coords, or empty if no path
 */
export function findPath (startX, startZ, endX, endZ, walkableGrid, maxSteps = 15000) {
  const { grid, size, gridRes } = walkableGrid

  // Convert world → grid coords
  let sx = Math.floor(startX / gridRes)
  let sz = Math.floor(startZ / gridRes)
  let ex = Math.floor(endX / gridRes)
  let ez = Math.floor(endZ / gridRes)

  // Clamp to grid bounds
  sx = Math.max(0, Math.min(size - 1, sx))
  sz = Math.max(0, Math.min(size - 1, sz))
  ex = Math.max(0, Math.min(size - 1, ex))
  ez = Math.max(0, Math.min(size - 1, ez))

  // If start or end is not walkable (0 = blocked), snap to nearest walkable cell
  if (grid[sz * size + sx] === 0) {
    const snapped = snapToWalkable(sx, sz, grid, size)
    if (!snapped) return []
    sx = snapped.gx; sz = snapped.gz
  }
  if (grid[ez * size + ex] === 0) {
    const snapped = snapToWalkable(ex, ez, grid, size)
    if (!snapped) return []
    ex = snapped.gx; ez = snapped.gz
  }

  // Trivial case
  if (sx === ex && sz === ez) {
    return [{ x: ex * gridRes + gridRes / 2, z: ez * gridRes + gridRes / 2 }]
  }

  // A*
  const key = (gx, gz) => gz * size + gx
  const heuristic = (gx, gz) => Math.abs(gx - ex) + Math.abs(gz - ez)

  const gScore = new Float32Array(size * size)
  gScore.fill(Infinity)
  const cameFrom = new Int32Array(size * size)
  cameFrom.fill(-1)

  const startKey = key(sx, sz)
  gScore[startKey] = 0

  const open = new MinHeap()
  open.push({ gx: sx, gz: sz, f: heuristic(sx, sz) })

  let steps = 0
  while (open.length > 0 && steps < maxSteps) {
    steps++
    const current = open.pop()
    const { gx, gz } = current
    const ck = key(gx, gz)

    // Reached goal?
    if (gx === ex && gz === ez) {
      return reconstructPath(cameFrom, ck, sx, sz, size, gridRes)
    }

    const currentG = gScore[ck]

    for (const dir of DIRS) {
      const nx = gx + dir.dx
      const nz = gz + dir.dz
      if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue
      const nk = key(nx, nz)
      const cellCost = grid[nk]
      if (cellCost === 0 || cellCost === 4) continue // blocked: 0=water/building, 4=grass

      // For diagonal moves, check that both cardinal neighbors are also walkable
      // (prevents corner-cutting through buildings)
      if (dir.dx !== 0 && dir.dz !== 0) {
        const c1 = grid[key(gx + dir.dx, gz)], c2 = grid[key(gx, gz + dir.dz)]
        if (c1 === 0 || c1 === 4 || c2 === 0 || c2 === 4) continue
      }

      // Weighted cost: Gehwege/Steinwege (deco=2) are cheapest, roads expensive, grass very expensive
      // 0→blocked/water, 1→road, 2→Gehweg/Steinweg/deco, 3→building-entrance, 4→grass
      const COST_WEIGHT = [0, 3.0, 0.5, 4.0, 10.0]
      const weight = COST_WEIGHT[cellCost] || 1.0
      const tentativeG = currentG + dir.cost * weight
      if (tentativeG < gScore[nk]) {
        gScore[nk] = tentativeG
        cameFrom[nk] = ck
        open.push({ gx: nx, gz: nz, f: tentativeG + heuristic(nx, nz) })
      }
    }
  }

  // No path found — return direct line as fallback
  return []
}

function reconstructPath (cameFrom, endKey, sx, sz, size, gridRes) {
  const path = []
  let k = endKey
  while (k !== -1) {
    const gz = Math.floor(k / size)
    const gx = k % size
    path.push({ x: gx * gridRes + gridRes / 2, z: gz * gridRes + gridRes / 2 })
    if (gx === sx && gz === sz) break
    k = cameFrom[k]
  }
  path.reverse()

  // Simplify: remove collinear waypoints to reduce count
  return simplifyPath(path)
}

function simplifyPath (path) {
  if (path.length <= 2) return path
  const result = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = path[i]
    const next = path[i + 1]
    // Keep point only if direction changes
    const dx1 = curr.x - prev.x
    const dz1 = curr.z - prev.z
    const dx2 = next.x - curr.x
    const dz2 = next.z - curr.z
    if (Math.abs(dx1 * dz2 - dz1 * dx2) > 0.01) {
      result.push(curr)
    }
  }
  result.push(path[path.length - 1])
  return result
}

/**
 * Snap a non-walkable grid cell to the nearest walkable cell (BFS).
 */
function snapToWalkable (gx, gz, grid, size, maxRadius = 20) {
  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dz of [-r, r]) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
          const v = grid[nz * size + nx]
          if (v === 1 || v === 2) return { gx: nx, gz: nz } // only road or Gehweg
        }
      }
    }
    for (let dz = -r + 1; dz < r; dz++) {
      for (const dx of [-r, r]) {
        const nx = gx + dx
        const nz = gz + dz
        if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
          const v = grid[nz * size + nx]
          if (v === 1 || v === 2) return { gx: nx, gz: nz }
        }
      }
    }
  }
  return null
}

/**
 * Pick a random walkable cell within a radius (in world coords).
 * Useful for choosing wander destinations on roads.
 *
 * @param {number} cx - Center world X
 * @param {number} cz - Center world Z
 * @param {number} radius - Search radius in world coords
 * @param {{grid: Uint8Array, size: number, gridRes: number}} walkableGrid
 * @param {function} rng - Random function returning 0-1
 * @returns {{x: number, z: number}|null}
 */
export function randomWalkableNear (cx, cz, radius, walkableGrid, rng) {
  const { grid, size, gridRes } = walkableGrid
  const gcx = Math.floor(cx / gridRes)
  const gcz = Math.floor(cz / gridRes)
  const gr = Math.ceil(radius / gridRes)

  // Collect walkable cells in radius with weights (roads 4×, rest 1×)
  const candidates = []
  let totalWeight = 0
  for (let dx = -gr; dx <= gr; dx++) {
    for (let dz = -gr; dz <= gr; dz++) {
      if (dx * dx + dz * dz > gr * gr) continue
      const nx = gcx + dx
      const nz = gcz + dz
      if (nx >= 0 && nx < size && nz >= 0 && nz < size && grid[nz * size + nx] > 0) {
        // Gehwege/Steinwege (2) strongly preferred as wander targets, roads (1) acceptable
        const cellVal = grid[nz * size + nx]
        const weight = cellVal === 2 ? 10 : cellVal === 1 ? 2 : 1
        totalWeight += weight
        candidates.push({ gx: nx, gz: nz, weight })
      }
    }
  }

  if (candidates.length === 0) return null
  // Weighted random pick: roads are 4× more likely as wander targets
  let r = rng() * totalWeight
  let pick = candidates[candidates.length - 1]
  for (const c of candidates) {
    r -= c.weight
    if (r <= 0) { pick = c; break }
  }
  return { x: pick.gx * gridRes + gridRes / 2, z: pick.gz * gridRes + gridRes / 2 }
}
