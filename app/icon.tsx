import {makeBrandIcon} from '@/lib/brand-home-icon';
import {getServerPublicShopData} from '@/lib/server-public-shop';
import {connection} from 'next/server';

export const size={width:192,height:192};
export const contentType='image/png';

export default async function Icon(){
  await connection();
  const {shopConfig}=await getServerPublicShopData();
  return makeBrandIcon(size.width,shopConfig.logoUrl);
}
