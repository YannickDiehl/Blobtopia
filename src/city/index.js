/**
 * city/index.js — Facade re-exporting public API from city modules
 */
export { createCity } from './procedural'
export { createCityFromLayout } from './layout-renderer'
export { buildingRegistry, walkableGrid } from './building-registry'
export { LANDMARKS_DATA, DISTRICTS, getDistrictAt } from './districts'
