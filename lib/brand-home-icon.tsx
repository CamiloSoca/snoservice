import {ImageResponse} from 'next/og';

function configuredLogoUrl(value?:string|null):string|null {
  if(!value) return null;
  try {
    const logo=new URL(value);
    const projectHost=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||'').hostname;
    if(logo.protocol!=='https:'||!projectHost||logo.hostname!==projectHost||
      !logo.pathname.startsWith('/storage/v1/object/public/')) return null;
    return logo.toString();
  } catch {
    return null;
  }
}

export async function makeBrandIcon(size:number,logoSource?:string|null):Promise<ImageResponse> {
  const logo=configuredLogoUrl(logoSource);
  return new ImageResponse(
    <div style={{
      width:'100%',height:'100%',display:'flex',alignItems:'center',
      justifyContent:'center',borderRadius:Math.round(size*.22),
      overflow:'hidden',background:'#09090b',color:'#f4f4f5',fontSize:Math.round(size*.3),fontWeight:900,
    }}>
      {logo
        ? <img src={logo} width={size} height={size} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />
        : <div style={{display:'flex',width:'100%',height:'100%',alignItems:'center',justifyContent:'center'}}>SN</div>}
    </div>,
    {width:size,height:size},
  );
}
