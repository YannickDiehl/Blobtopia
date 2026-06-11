/**
 * city/index.js — Facade re-exporting public API from city modules
 */
export { createCityFromLayout } from './layout-renderer'
export { buildingRegistry, walkableGrid } from './building-registry'
export { LANDMARKS_DATA, DISTRICTS, getDistrictAt } from './districts'
