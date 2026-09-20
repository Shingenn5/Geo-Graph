export async function GET(request: Request) {
 const parts=new URL(request.url).pathname.split('/').slice(-3).map(Number);
 const [z,x,y]=parts;
 if(!parts.every(Number.isInteger)||z<0||z>14||x<0||y<0||x>=2**z||y>=2**z)return new Response('Invalid tile',{status:400});
 try{const r=await fetch(`https://tiles.macrostrat.org/carto/${z}/${x}/${y}.png`,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Tile unavailable');return new Response(r.body,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});}catch{return new Response('Geology tile unavailable',{status:502});}
}
