import {makeBrandIcon} from '@/lib/brand-home-icon';
import {getServerPublicShopData} from '@/lib/server-public-shop';
import {connection} from 'next/server';

export const size={width:180,height:180};
export const contentType='image/png';

// Next.js publishes <link rel="apple-touch-icon"> for Safari/iPhone automatically.
export default async function AppleIcon(){
  await connection();
  const {shopConfig}=await getServerPublicShopData();
  return makeBrandIcon(size.width,shopConfig.logoUrl);
}
