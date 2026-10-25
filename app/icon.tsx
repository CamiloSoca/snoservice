import {makeBrandIcon} from '@/lib/brand-home-icon';

export const size={width:192,height:192};
export const contentType='image/png';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export default async function Icon(){
  return makeBrandIcon(size.width);
}
