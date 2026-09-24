/** Fixed-source tile proxy; no user-controlled upstream URLs. */
export async function GET(_request: Request, context: { params: Promise<{z:string;x:string;y:string}> }) {
  const raw=await context.params;
  const z=Number(raw.z),x=Number(raw.x),y=Number(raw.y);
  if(![z,x,y].every(Number.isInteger)||z<0||z>15||x<0||y<0||x>=2**z||y>=2**z)return new Response("Invalid tile",{status:400});
  const extent=20037508.342789244,span=2*extent/2**z;
  const url=new URL("https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage");
  url.search=new URLSearchParams({bbox:[-extent+x*span,extent-(y+1)*span,-extent+(x+1)*span,extent-y*span].join(","),bboxSR:"3857",imageSR:"3857",size:"256,256",format:"png",f:"image",renderingRule:JSON.stringify({rasterFunction:"Hillshade Multidirectional"})}).toString();
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(!response.ok||!response.headers.get("content-type")?.includes("image/"))throw new Error("Invalid relief image");
    return new Response(response.body,{headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=86400","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response("USGS relief unavailable",{status:502});}
}
