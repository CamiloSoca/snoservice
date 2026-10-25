import {makeBrandIcon} from '@/lib/brand-home-icon';

export const size={width:180,height:180};
export const contentType='image/png';

// Next.js publishes <link rel="apple-touch-icon"> for Safari/iPhone automatically.
export default async function AppleIcon(){
  return makeBrandIcon(size.width);
}
