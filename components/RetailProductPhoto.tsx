import Image from 'next/image';
import {Package} from 'lucide-react';

type Props={
  src:string|null|undefined;
  slug:string;
  name:string;
  size?:'tile'|'catalog';
  priority?:boolean;
};

// La imagen original de la pomada es cuadrada con fondo blanco. Su lata
// circular ocupa ~76% del encuadre: recortamos visualmente el margen blanco
// sin alterar el archivo (ni recortar otros productos futuros).
export default function RetailProductPhoto({src,slug,name,size='tile',priority=false}:Props) {
  const pomade=slug==='golden-moustache-matte-60g';
  const dimensions=size==='tile'?'h-[76px] w-[76px] sm:h-[82px] sm:w-[82px]':
    'h-32 w-32 sm:h-40 sm:w-40';
  return (
    <div className={'relative isolate flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-[#141817] shadow-[0_12px_30px_rgba(0,0,0,0.28)] '+
      dimensions+' '+(pomade?'rounded-full':'rounded-2xl')}>
      {src
        ? <Image
            src={src}
            alt={'Foto de '+name}
            fill
            sizes={size==='tile'?'(max-width: 640px) 76px, 82px':'(max-width: 640px) 128px, 160px'}
            quality={75}
            unoptimized={src.startsWith('/products/')}
            priority={priority}
            className={pomade?'object-cover scale-[1.32]':'object-contain p-2'}
          />
        : <Package className="h-10 w-10 text-emerald-400" aria-hidden="true"/>}
    </div>
  );
}
