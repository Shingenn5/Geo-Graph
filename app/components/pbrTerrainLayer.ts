import type { CustomLayerInterface, Map as GLMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";

export const PBR_TERRAIN_LAYER_ID = "pbr-terrain-study";

type StudyLayer = CustomLayerInterface & { refresh: () => void };

const PATCH_LEVELS = [
  { zoom: 15, sizeMeters: 1_500, segments: 64 },
  { zoom: 15.75, sizeMeters: 1_100, segments: 80 },
  { zoom: 16.5, sizeMeters: 800, segments: 104 },
  { zoom: 17.25, sizeMeters: 600, segments: 128 },
] as const;
const GROUND_TILE_METERS = 12;
const TEXTURE_ANCHOR_METERS = 48;
const MERCATOR_WORLD_METERS = 40_075_016.68557849;

function smoothstep(value: number) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function makeEdgeMask() {
  const width = 64;
  const bytes = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const edge = Math.min(x, y, width - 1 - x, width - 1 - y) / 7;
      const value = Math.round(255 * Math.min(1, Math.max(0, edge)));
      const index = (y * width + x) * 4;
      bytes[index] = bytes[index + 1] = bytes[index + 2] = value;
      bytes[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(bytes, width, width, THREE.RGBAFormat);
  texture.channel = 1; // uv1 keeps the edge fade independent of repeating rock maps.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function makeRockMask(geometry: THREE.PlaneGeometry, segments: number) {
  const width = segments + 1;
  const bytes = new Uint8Array(width * width * 4);
  const normals = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv1");
  for (let index = 0; index < normals.count; index++) {
    const u = uv.getX(index);
    const v = uv.getY(index);
    const edge = smoothstep(Math.min(u, v, 1 - u, 1 - v) / 0.08);
    // The DEM supplies slope, not a surveyed rock classification.
    const steepness = 1 - Math.abs(normals.getZ(index));
    const exposure = smoothstep((steepness - 0.12) / 0.3);
    const pixel = (Math.round(v * segments) * width + Math.round(u * segments)) * 4;
    bytes[pixel] = bytes[pixel + 1] = bytes[pixel + 2] = Math.round(255 * edge * exposure);
    bytes[pixel + 3] = 255;
  }
  const texture = new THREE.DataTexture(bytes, width, width, THREE.RGBAFormat);
  texture.channel = 1;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function createPbrTerrainLayer(map: GLMap, onStatus: (status: string) => void): StudyLayer {
  let renderer: THREE.WebGLRenderer | null = null;
  let groundMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
  let rockMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
  let origin: MercatorCoordinate | null = null;
  let lastCenter: [number, number] | null = null;
  let lastPatchSize = 0;
  let lastPatchSegments = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  groundMaterial.alphaMap = makeEdgeMask();
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0xbebebe,
    metalness: 0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rockTransform = new THREE.Vector3(0, 0, 1);
  // Project the rock color and roughness from local terrain coordinates along
  // all three axes. The existing UV projection compresses texture distance on
  // steep faces, which makes the overlay look stretched at close zoom.
  rockMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uRockTransform = { value: rockTransform };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRockPosition; varying vec3 vRockNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRockPosition = transformed;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvRockNormal = objectNormal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRockPosition; varying vec3 vRockNormal; uniform vec3 uRockTransform;\nvec4 sampleRockTriplanar(sampler2D tex) { vec3 w = pow(abs(normalize(vRockNormal)), vec3(4.0)); w /= max(w.x + w.y + w.z, 0.0001); vec3 p = vec3(uRockTransform.x + vRockPosition.x * uRockTransform.z, uRockTransform.y - vRockPosition.y * uRockTransform.z, vRockPosition.z); vec2 xz = p.xz / 16.0; vec2 yz = p.yz / 16.0; vec2 xy = p.xy / 16.0; return texture2D(tex, yz) * w.x + texture2D(tex, xz) * w.y + texture2D(tex, xy) * w.z; }")
      .replace("vec4 sampledDiffuseColor = texture2D( map, vMapUv );", "vec4 sampledDiffuseColor = sampleRockTriplanar(map);")
      .replace("vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );", "vec4 texelRoughness = sampleRockTriplanar(roughnessMap);");
  };
  rockMaterial.customProgramCacheKey = () => "rock-triplanar-v2";
  scene.add(new THREE.AmbientLight(0xdce7ef, 0.75));
  const sun = new THREE.DirectionalLight(0xffe9cc, 1.5);
  sun.position.set(-350, 260, 700);
  scene.add(sun);

  function disposeMesh() {
    if (!groundMesh || !rockMesh) return;
    scene.remove(groundMesh, rockMesh);
    groundMesh.geometry.dispose();
    rockMaterial.alphaMap?.dispose();
    rockMaterial.alphaMap = null;
    groundMesh = null;
    rockMesh = null;
  }

  function refresh() {
    if (map.getZoom() < 15 || !map.getTerrain()) return;
    const center = map.getCenter().wrap();
    const zoom = map.getZoom();
    // Stable bands avoid resampling the DEM on every fractional zoom change.
    const level = [...PATCH_LEVELS].reverse().find(item => zoom >= item.zoom) ?? PATCH_LEVELS[0];
    const patchSize = level.sizeMeters;
    const patchSegments = level.segments;
    if (lastCenter) {
      const dx = (center.lng - lastCenter[0]) * 111_320 * Math.cos(center.lat * Math.PI / 180);
      const dy = (center.lat - lastCenter[1]) * 111_320;
      const movedEnough = Math.hypot(dx, dy) >= Math.min(130, patchSize * 0.12);
      if (!movedEnough && patchSize === lastPatchSize && patchSegments === lastPatchSegments) return;
    }

    const nextOrigin = MercatorCoordinate.fromLngLat(center, 0);
    const metersToMercator = nextOrigin.meterInMercatorCoordinateUnits();
    const geometry = new THREE.PlaneGeometry(patchSize, patchSize, patchSegments, patchSegments);
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const worldScale = metersToMercator * MERCATOR_WORLD_METERS;
    const anchorX = (nextOrigin.x * MERCATOR_WORLD_METERS) % TEXTURE_ANCHOR_METERS;
    const anchorY = (nextOrigin.y * MERCATOR_WORLD_METERS) % TEXTURE_ANCHOR_METERS;
    rockTransform.set(anchorX, anchorY, worldScale);
    const edgeUv = new Float32Array(uv.array.length);
    let missingElevation = false;

    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const location = new MercatorCoordinate(
        nextOrigin.x + x * metersToMercator,
        nextOrigin.y - y * metersToMercator,
        0,
      ).toLngLat();
      const elevation = map.queryTerrainElevation(location);
      if (elevation == null) {
        missingElevation = true;
        break;
      }
      positions.setZ(index, elevation + 3);
      edgeUv[index * 2] = uv.getX(index);
      edgeUv[index * 2 + 1] = uv.getY(index);
      uv.setXY(index, (anchorX + x * worldScale) / GROUND_TILE_METERS, (anchorY - y * worldScale) / GROUND_TILE_METERS);
    }

    if (missingElevation) {
      geometry.dispose();
      onStatus("Waiting for elevation tiles");
      return;
    }
    geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(edgeUv, 2));
    positions.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.computeVertexNormals();
    disposeMesh();
    rockMaterial.alphaMap = makeRockMask(geometry, patchSegments);
    groundMesh = new THREE.Mesh(geometry, groundMaterial);
    rockMesh = new THREE.Mesh(geometry, rockMaterial);
    groundMesh.frustumCulled = rockMesh.frustumCulled = false;
    groundMesh.renderOrder = 1;
    rockMesh.renderOrder = 2;
    scene.add(groundMesh, rockMesh);
    origin = nextOrigin;
    lastCenter = [center.lng, center.lat];
    lastPatchSize = patchSize;
    lastPatchSegments = patchSegments;
    onStatus("Ground + rock textures active");
    map.triggerRepaint();
  }

  const layer: StudyLayer = {
    id: PBR_TERRAIN_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    refresh,
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      const loader = new THREE.TextureLoader();
      const load = (folder: string, name: string, scale: number) => {
        const texture = loader.load(`/materials/${folder}/${name}.jpg`, () => map.triggerRepaint(), undefined, () => onStatus("Material texture unavailable"));
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(scale, scale);
        texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1);
        return texture;
      };
      groundMaterial.map = load("gravelly-sand", "color", 1);
      groundMaterial.map.colorSpace = THREE.SRGBColorSpace;
      groundMaterial.normalMap = load("gravelly-sand", "normal", 1);
      groundMaterial.normalScale.set(0.75, 0.75);
      groundMaterial.roughnessMap = load("gravelly-sand", "roughness", 1);
      groundMaterial.needsUpdate = true;
      rockMaterial.map = load("rock-face", "color", 1);
      rockMaterial.map.colorSpace = THREE.SRGBColorSpace;
      // Tangent-space normal maps cannot use the same three-axis blend without
      // a separate basis transform, so omit it rather than retain visibly
      // stretched normals on cliffs.
      rockMaterial.normalMap = null;
      rockMaterial.roughnessMap = load("rock-face", "roughness", 1);
      rockMaterial.needsUpdate = true;
      refresh();
    },
    render(_gl, args) {
      if (!renderer || !groundMesh || !rockMesh || !origin || map.getZoom() < 15) return;
      const scale = origin.meterInMercatorCoordinateUnits();
      const model = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = new THREE.Matrix4()
        .fromArray(args.defaultProjectionData.mainMatrix)
        .multiply(model);
      renderer.resetState();
      renderer.render(scene, camera);
    },
    onRemove() {
      disposeMesh();
      for (const material of [groundMaterial, rockMaterial]) {
        material.map?.dispose();
        material.normalMap?.dispose();
        material.roughnessMap?.dispose();
        material.alphaMap?.dispose();
        material.dispose();
      }
      renderer?.dispose();
      renderer = null;
    },
  };
  return layer;
}
