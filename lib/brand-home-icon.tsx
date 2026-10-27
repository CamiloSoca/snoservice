import {ImageResponse} from 'next/og';
import {connection} from 'next/server';

// Imagen oficial proporcionada por el dueño. No crear otro logo ni usar el monograma de prueba.
export const OFFICIAL_13_CUT_LOGO =
  'https://zdhuymfapknpogdrbksn.supabase.co/storage/v1/object/public/media/0f5ab934-db55-46d2-a829-ecd59150d61a/logo/0f5ab934-db55-46d2-a829-ecd59150d61a.png?v=1791937983092';

export async function makeBrandIcon(size:number):Promise<ImageResponse> {
  await connection(); // Logo fetched on demand, not locked to a build-time fallback.
  let source:string|null=null;
  try {
    // Only this fixed public asset may be read here; no user-controlled remote URL.
    const image=await fetch(OFFICIAL_13_CUT_LOGO,{next:{revalidate:86400}});
    const kind=(image.headers.get('content-type')||'').split(';')[0].toLowerCase();
    const reportedSize=Number(image.headers.get('content-length')||'0');
    if(!image.ok||!['image/png','image/jpeg','image/webp'].includes(kind)
       ||reportedSize>2_000_000)throw new Error('Logo oficial no disponible.');
    const bytes=await image.arrayBuffer();
    if(!bytes.byteLength||bytes.byteLength>2_000_000)throw new Error('Logo oficial inválido.');
    source='data:'+kind+';base64,'+Buffer.from(bytes).toString('base64');
  }catch{
    console.warn('Ícono 13 Cut: no se pudo recuperar el logo oficial.');
  }
  // El logo original ya incorpora su propia forma redondeada.
  // En iOS el acceso directo recibe OTRA máscara redondeada. Evitamos
  // que se vean dos marcos haciendo que la imagen llene toda la superficie.
  // El ligero sangrado recorta solo los bordes decorativos, sin tocar el texto.
  const bleed=Math.round(size*1.05);
  return new ImageResponse(
    <div style={{
      width:'100%',height:'100%',display:'flex',alignItems:'center',
      justifyContent:'center',overflow:'hidden',background:'#09090b',
    }}>
      {source
        ? <img src={source} width={bleed} height={bleed}
            alt="13 Cut" style={{objectFit:'cover',flexShrink:0}}/>
        : <div style={{display:'flex',alignItems:'center',justifyContent:'center',
            width:'100%',height:'100%',color:'#f4f4f5',fontSize:Math.round(size*.31),fontWeight:900}}>
            13
          </div>}
    </div>,
    {width:size,height:size},
  );
}
