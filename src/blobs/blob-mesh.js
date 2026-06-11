import * as THREE from 'three'
import chroma from 'chroma-js'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import traitColors from '@/config/trait-colors'
import { blobColors } from '@/config/blob-colors'
import districtsData from '../../data/districts.json'

// District color hex for nametag badges (derived from shared JSON)
export const DISTRICT_HEX = {}
for (const d of districtsData) { DISTRICT_HEX[d.id] = d.color_hex }

export const blobColor = blobColors.default

function makeEye(size){
  let geo = new THREE.SphereGeometry( size, 16, 16, Math.PI / 2, Math.PI )
  let material = new THREE.MeshBasicMaterial({ color: 0x000000 })
  return new THREE.Mesh( geo, material )
}

function createBlobCreatureParts(){
  const size = 40
  const resolution = 160
  const isolation = 300
  // großzügiger maxPolyCount — der Puffer ist bei res 160 sonst zu klein
  const effect = new MarchingCubes(resolution, new THREE.MeshBasicMaterial(), true, true, 200000)
  effect.scale.set(size, size, size)
  effect.isolation = isolation

  let strength = 1.2 / ( ( Math.sqrt( 3 ) - 1 ) / 4 + 1 )
  effect.reset()
  effect.addBall(0.5, 0.5, 0.5, strength, 100)
  effect.addBall(0.52, 0.54, 0.5, strength/8, 10)
  effect.addBall(0.515, 0.58, 0.5, strength/4, 10)

  // generateBufferGeometry() wurde aus MarchingCubes entfernt — update()
  // füllt die vorallokierten Attribute, wir schneiden den genutzten Bereich aus
  effect.update()
  const used = effect.count * 3
  let geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(effect.geometry.getAttribute('position').array.slice(0, used), 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(effect.geometry.getAttribute('normal').array.slice(0, used), 3))
  effect.geometry.dispose()
  effect.material.dispose()
  let material = new THREE.MeshLambertMaterial({ color: blobColor })
  let blob = new THREE.Mesh( geo, material )
  blob.name = 'blob'
  blob.scale.set(size, size, size)
  blob.position.y = 4

  // eyes
  let x = 0.082
  let right = makeEye(size / 85)
  right.name = 'right-eye'
  right.position.set(size * x, size / 4.2, size / 30)
  right.rotation.set(-0.6, -0.6, 0)

  let left = right.clone() //makeEye(size / 85)
  left.name = 'left-eye'
  left.position.set(size * x, size / 4.2, -size / 30)
  left.rotation.set(0.6, 0.6, 0)

  return [blob, left, right]
}

function createCircle(r, color = 'white'){
  let geometry = new THREE.CircleGeometry( r, 64 )
  let material = new THREE.MeshBasicMaterial({ color })
  let circle = new THREE.Mesh( geometry, material )
  return circle
}

const cachedBlobParts = createBlobCreatureParts()

export const createBlob = () => cachedBlobParts.reduce(
  (group, part) => group.add(part.clone(true))
  , new THREE.Group()
)

export const cachedVisionCircle = (() => {
  let c = createCircle(1, chroma.mix(traitColors.sense_range, 'white', 0.8).num())
  c.rotation.x = -Math.PI / 2
  c.position.y = 0.1
  c.material.depthWrite = false
  c.material.transparent = true
  c.material.blending = THREE.MultiplyBlending
  return c
})()

export const cachedEnergyCircle = (() => {
  let c = createCircle(6)
  c.rotation.x = -Math.PI / 2
  c.position.y = 0.1
  c.material.depthWrite = false
  c.material.transparent = true
  return c
})()

export const blobMaterialProps = {
  color: {
    type: Number
    , default: blobColor
  }
}
