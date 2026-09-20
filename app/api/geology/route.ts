export async function GET(request: Request) {
 const url=new URL(request.url),lat=Number(url.searchParams.get("lat")),lng=Number(url.searchParams.get("lng"));
 if(!url.searchParams.has("lat")||!url.searchParams.has("lng")||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>85||Math.abs(lng)>180)return Response.json({error:"Invalid coordinates"},{status:400});
 try{const response=await fetch(`https://macrostrat.org/api/v2/geologic_units/map?lat=${lat}&lng=${lng}`,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error("Upstream failed");const data=await response.json() as {success?:{data?:unknown[];refs?:Record<string,string>}};if(!Array.isArray(data.success?.data))throw new Error("Invalid response");return Response.json({units:data.success!.data,refs:data.success!.refs||{}},{headers:{"Cache-Control":"public, max-age=3600"}});}catch{return Response.json({error:"Geology service unavailable"},{status:502});}
}

