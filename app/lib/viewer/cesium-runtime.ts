import * as C from "cesium";
import { trackImagery } from "./imagery-progress";
import { TransitionGate } from "./transition";
import { recordMetric } from "./metrics";
import { CLEAR_IMAGERY_URL, WORLDCOVER_LAYER, type Surface } from "./sources";

export type SceneCallbacks = {
  status: (message: string) => void;
  terrain: (message: string) => void;
  active: (surface: Surface) => void;
  pick: (longitude: number, latitude: number, elevation: number) => void;
  center: (longitude: number, latitude: number) => void;
};

/** Only this dynamically imported module loads the Cesium renderer. */
export function createScene(container: HTMLElement, callbacks: SceneCallbacks) {
  const started = performance.now();
  const viewer = new C.Viewer(container, {
    baseLayer: false, animation: false, timeline: false, geocoder: false,
    homeButton: false, sceneModePicker: false, baseLayerPicker: false,
    infoBox: false, selectionIndicator: false, navigationHelpButton: false,
    fullscreenButton: false, requestRenderMode: true, maximumRenderTimeChange: Infinity,
    shadows: false, skyBox: false,
  });
  viewer.resolutionScale = 1;
  viewer.scene.globe.maximumScreenSpaceError = 4;
  viewer.scene.globe.tileCacheSize = 96;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.baseColor = C.Color.fromCssColorString("#677d70");
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
  const originalFly = (longitude: number, latitude: number, height: number) => {
    const target=C.Cartesian3.fromDegrees(longitude,latitude);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target,0),{offset:new C.HeadingPitchRange(0,C.Math.toRadians(height>1_000_000?-90:-55),height),duration:1.3});
  };
  viewer.camera.lookAt(C.Cartesian3.fromDegrees(-112.112,36.106),new C.HeadingPitchRange(0,C.Math.toRadians(-55),16000));
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  function groundCenter(){const ray=viewer.camera.getPickRay(new C.Cartesian2(viewer.canvas.clientWidth/2,viewer.canvas.clientHeight/2));const hit=ray&&viewer.scene.globe.pick(ray,viewer.scene);return hit?C.Cartographic.fromCartesian(hit):viewer.camera.positionCartographic;}
  let disposed = false;
  const gate = new TransitionGate();
  const cache = new Map<Surface, C.ImageryLayer>();
  const progress=new Map<Surface,ReturnType<typeof trackImagery>>();
  let fadeFrame=0;
  let active: Surface = "Natural";
  let cancelWait: (() => void) | undefined;
  let selected: C.Entity | undefined;
  let labels: C.ImageryLayer | undefined;
  let labelGeneration = 0;
  let moving = false;
  const elevationMaterial = C.Material.fromType("ElevationRamp");
  const ramp = document.createElement("canvas"); ramp.width = 256; ramp.height = 1;
  const context = ramp.getContext("2d")!;
  const gradient = context.createLinearGradient(0, 0, 256, 0);
  [[0,"#375e64"],[.1,"#678168"],[.3,"#ad986c"],[.55,"#ad7f62"],[.8,"#ddd2b6"],[1,"#ffffff"]].forEach(([stop,color])=>gradient.addColorStop(Number(stop),String(color)));
  context.fillStyle=gradient;context.fillRect(0,0,256,1);
  elevationMaterial.uniforms.image=ramp;elevationMaterial.uniforms.minimumHeight=-100;elevationMaterial.uniforms.maximumHeight=5000;

  const terrainReady = C.CesiumTerrainProvider.fromUrl("https://terrain.reearth.land/cesium-mesh/ellipsoid", { requestVertexNormals: false, requestWaterMask: false })
    .then(provider => {
      if (disposed) return;
      viewer.terrainProvider = provider;
      callbacks.terrain("Re:Earth / Mapterhorn terrain · ellipsoidal heights · resolution varies");
      provider.errorEvent.addEventListener(() => { if(!disposed)callbacks.terrain("Some terrain tiles unavailable; retaining loaded terrain."); });
      viewer.scene.requestRender();
    }).catch(() => { if (!disposed) callbacks.terrain("Terrain service unavailable. Globe shown without elevation; standard viewer remains available."); });

  function provider(surface: Surface): C.ImageryProvider {
    if(surface === "Natural") return new C.UrlTemplateImageryProvider({url:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",maximumLevel:19,credit:"Imagery © Esri, Maxar, Earthstar Geographics and GIS User Community"});
    if(surface === "Clear imagery") return new C.UrlTemplateImageryProvider({url:CLEAR_IMAGERY_URL,maximumLevel:19,credit:"World Imagery (Clarity) archive © Esri, Vantor, Earthstar Geographics, IGN and GIS User Community"});
    if(surface === "Geology") return new C.UrlTemplateImageryProvider({url:`${location.origin}/api/tiles/{z}/{x}/{y}`,maximumLevel:14,credit:"Macrostrat and original survey authors · CC BY 4.0"});
    if(surface === "Soil") return new C.WebMapServiceImageryProvider({url:"https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDM.wms",layers:"mapunitpoly",parameters:{transparent:true,format:"image/png",version:"1.1.1"},rectangle:C.Rectangle.fromDegrees(-180,17,-65,72),maximumLevel:17,credit:"USDA NRCS SSURGO"});
    if(surface === "Land cover") return new C.WebMapServiceImageryProvider({url:"https://mapproxy.terrascope.be/mapproxy/service",layers:WORLDCOVER_LAYER,parameters:{transparent:true,format:"image/png",version:"1.1.1",time:"2021-01-01"},maximumLevel:14,credit:"© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium"});
    return new C.UrlTemplateImageryProvider({url:`${location.origin}/api/relief/{z}/{x}/{y}`,tilingScheme:new C.WebMercatorTilingScheme(),rectangle:C.Rectangle.fromDegrees(-125,24,-66,50),maximumLevel:15,credit:"USGS 3DEP hillshade (imagery overlay)"});
  }
  function commit(surface: Surface) {
    active=surface;callbacks.active(surface);
    for(const [name,layer] of cache){layer.show=name===surface||(name==="Natural"&&surface!=="Bare Earth");layer.alpha=1;}
    viewer.scene.globe.material=surface==="Bare Earth"?elevationMaterial:undefined;
    // At most the natural base plus two recently used thematic layers.
    for(const [name,layer] of cache){if(cache.size<=3)break;if(name!==active&&name!=="Natural"){viewer.imageryLayers.remove(layer,true);cache.delete(name);progress.delete(name);}}
    if(labels)viewer.imageryLayers.raiseToTop(labels);
    viewer.scene.requestRender();
  }
  async function surface(next: Surface) {
    const generation=gate.begin();cancelWait?.();cancelAnimationFrame(fadeFrame);commit(active);
    const switchStarted=performance.now();
    if(next==="Bare Earth"){commit(next);callbacks.status("");recordMetric("cesium-layer-"+next,switchStarted);return;}
    const center=groundCenter();
    const longitude=C.Math.toDegrees(center.longitude),latitude=C.Math.toDegrees(center.latitude);
    if((next==="Soil"&&(longitude< -180||longitude> -65||latitude<17||latitude>72))||(next==="USGS relief"&&(longitude< -125||longitude> -66||latitude<24||latitude>50))){
      callbacks.status("This layer covers the U.S. Previous view retained.");return;
    }
    callbacks.status(`Loading ${next}…`);
    let layer=cache.get(next);
    if(!layer){const source=provider(next);progress.set(next,trackImagery(source));layer=viewer.imageryLayers.addImageryProvider(source);cache.set(next,layer);}
    else{cache.delete(next);cache.set(next,layer);}
    const target=layer;target.show=true;target.alpha=0.001;
    viewer.imageryLayers.raiseToTop(target);if(labels)viewer.imageryLayers.raiseToTop(labels);
    let finished=false;let rendered=0;let timeout:ReturnType<typeof setTimeout>|undefined=undefined;
    const poll=setInterval(()=>{if(!disposed)viewer.scene.requestRender();},150);
    const cleanup=()=>{removeRender();removeError();clearTimeout(timeout);clearInterval(poll);};
    const restore=()=>{if(cache.get(next)===target){target.show=next===active||next==="Natural";target.alpha=1;} viewer.scene.requestRender();};
    const removeError=target.imageryProvider.errorEvent.addEventListener(()=>{
      if(finished||!gate.current(generation))return;callbacks.status(`Loading ${next}… some tiles unavailable`);
    });
    const removeRender=viewer.scene.postRender.addEventListener(()=>{
      const focus=groundCenter();
      if(finished||!gate.current(generation)||++rendered<2||!progress.get(next)?.ready(focus.longitude,focus.latitude))return;
      finished=true;cleanup();
      const fadeStarted=performance.now();
      const fade=(now:number)=>{if(disposed||!gate.current(generation))return;target.alpha=Math.min(1,(now-fadeStarted)/180);viewer.scene.requestRender();if(target.alpha<1)fadeFrame=requestAnimationFrame(fade);else{commit(next);callbacks.status("");recordMetric("cesium-layer-"+next,switchStarted);}};
      fadeFrame=requestAnimationFrame(fade);
    });
    timeout=setTimeout(()=>{if(finished||!gate.current(generation))return;finished=true;cleanup();restore();callbacks.status(`${next} is taking too long. Previous view retained.`);},15000);
    cancelWait=()=>{if(!finished){finished=true;cleanup();restore();}};
    viewer.scene.requestRender();
  }
  function setLabels(show: boolean) {
    const generation=++labelGeneration;
    if(labels){labels.show=show;viewer.scene.requestRender();return;}
    if(!show)return;
    const layer=viewer.imageryLayers.addImageryProvider(new C.UrlTemplateImageryProvider({url:"https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",maximumLevel:19,credit:"Reference labels © Esri and contributors"}));
    if(disposed||generation!==labelGeneration){viewer.imageryLayers.remove(layer,true);return;}
    labels=layer;viewer.scene.requestRender();
  }
  const handler=new C.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((event:{position:C.Cartesian2})=>{
    const ray=viewer.camera.getPickRay(event.position);if(!ray)return;
    const hit=viewer.scene.globe.pick(ray,viewer.scene);if(!hit)return;
    const point=C.Cartographic.fromCartesian(hit);
    if(selected)viewer.entities.remove(selected);
    selected=viewer.entities.add({position:hit,point:{pixelSize:12,color:C.Color.fromCssColorString("#ffbd4a"),outlineColor:C.Color.WHITE,outlineWidth:2,disableDepthTestDistance:Number.POSITIVE_INFINITY}});
    callbacks.pick(C.Math.toDegrees(point.longitude),C.Math.toDegrees(point.latitude),point.height);viewer.scene.requestRender();
  },C.ScreenSpaceEventType.LEFT_CLICK);
  viewer.camera.moveStart.addEventListener(()=>{moving=true;viewer.scene.globe.maximumScreenSpaceError=8;});
  viewer.camera.moveEnd.addEventListener(()=>{moving=false;viewer.scene.globe.maximumScreenSpaceError=4;const p=groundCenter();callbacks.center(C.Math.toDegrees(p.longitude),C.Math.toDegrees(p.latitude));viewer.scene.requestRender();});
  // Only sample frame timing while moving; idle mode does not run a permanent frame loop.
  let lastFrame=0;let slowFrames=0;let frameCount=0;
  viewer.scene.postRender.addEventListener(()=>{const now=performance.now();if(moving&&lastFrame){frameCount++;if(now-lastFrame>33.4)slowFrames++;}lastFrame=now;});
  viewer.camera.moveEnd.addEventListener(()=>{if(frameCount){recordMetric(`cesium-motion-slow-frames-${slowFrames}-of-${frameCount}`,performance.now());frameCount=0;slowFrames=0;lastFrame=0;}});
  const removeInitial=viewer.scene.postRender.addEventListener(()=>{if(!viewer.scene.globe.tilesLoaded)return;recordMetric("cesium-initial-ready",started);removeInitial();});
  void surface("Natural");setLabels(true);void terrainReady;
  return {
    surface, labels:setLabels, fly:originalFly,
    scale(height:number){const p=groundCenter();originalFly(C.Math.toDegrees(p.longitude),C.Math.toDegrees(p.latitude),height);},
    destroy(){disposed=true;gate.cancel();cancelWait?.();cancelAnimationFrame(fadeFrame);handler.destroy();viewer.destroy();},
  };
}
