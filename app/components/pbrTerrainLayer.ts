import type { CustomLayerInterface, Map as GLMap } from "maplibre-gl";
import { MercatorCoordinate } from "maplibre-gl";
import * as THREE from "three";

export const PBR_TERRAIN_LAYER_ID = "pbr-terrain-study";

type StudyLayer = CustomLayerInterface & { refresh: () => void };

const PATCH_SIZE_METERS = 1_000;
const PATCH_SEGMENTS = 64;
const MATERIAL_WIDTH_METERS = 3;

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

export function createPbrTerrainLayer(map: GLMap, onStatus: (status: string) => void): StudyLayer {
  let renderer: THREE.WebGLRenderer | null = null;
  let mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null = null;
  let origin: MercatorCoordinate | null = null;
  let lastCenter: [number, number] | null = null;
  let lastZoom = 0;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.9,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  material.alphaMap = makeEdgeMask();
  scene.add(new THREE.AmbientLight(0xdce7ef, 1.5));
  const sun = new THREE.DirectionalLight(0xffe9cc, 3);
  sun.position.set(-350, 260, 700);
  scene.add(sun);

  function disposeMesh() {
    if (!mesh) return;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh = null;
  }

  function refresh() {
    if (map.getZoom() < 15 || !map.getTerrain()) return;
    const center = map.getCenter().wrap();
    if (lastCenter) {
      const dx = (center.lng - lastCenter[0]) * 111_320 * Math.cos(center.lat * Math.PI / 180);
      const dy = (center.lat - lastCenter[1]) * 111_320;
      if (Math.hypot(dx, dy) < 130 && Math.abs(map.getZoom() - lastZoom) < 1) return;
    }

    const nextOrigin = MercatorCoordinate.fromLngLat(center, 0);
    const metersToMercator = nextOrigin.meterInMercatorCoordinateUnits();
    const geometry = new THREE.PlaneGeometry(PATCH_SIZE_METERS, PATCH_SIZE_METERS, PATCH_SEGMENTS, PATCH_SEGMENTS);
    const positions = geometry.getAttribute("position");
    const uv = geometry.getAttribute("uv");
    const materialWidth = Math.max(MATERIAL_WIDTH_METERS, Math.min(18, MATERIAL_WIDTH_METERS * 2 ** (18 - map.getZoom())));
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
      uv.setXY(index, x / materialWidth, y / materialWidth);
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
    mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    origin = nextOrigin;
    lastCenter = [center.lng, center.lat];
    lastZoom = map.getZoom();
    onStatus("Illustrative material active");
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
      renderer.toneMappingExposure = 1.25;
      const loader = new THREE.TextureLoader();
      const load = (name: string) => {
        const texture = loader.load(`/materials/rocks-ground-06/${name}.jpg`, () => map.triggerRepaint(), undefined, () => onStatus("Material texture unavailable"));
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1);
        return texture;
      };
      material.map = load("color");
      material.map.colorSpace = THREE.SRGBColorSpace;
      material.normalMap = load("normal");
      material.normalScale.set(0.7, 0.7);
      material.roughnessMap = load("roughness");
      material.needsUpdate = true;
      refresh();
    },
    render(_gl, args) {
      if (!renderer || !mesh || !origin || map.getZoom() < 15) return;
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
      material.map?.dispose();
      material.normalMap?.dispose();
      material.roughnessMap?.dispose();
      material.alphaMap?.dispose();
      material.dispose();
      renderer?.dispose();
      renderer = null;
    },
  };
  return layer;
}
