import {ImageResponse} from 'next/og';

export const size={width:192,height:192};
export const contentType='image/png';

export default function Icon(){
 return new ImageResponse(
  <div style={{
   display:'flex',width:'100%',height:'100%',
   alignItems:'center',justifyContent:'center',
   flexDirection:'column',background:'#111113',
   border:'8px solid #29292d',borderRadius:36,
   color:'#f6f6f6',fontFamily:'sans-serif',
  }}>
    <div style={{display:'flex',fontSize:76,fontWeight:900,lineHeight:1,letterSpacing:-5}}>13</div>
    <div style={{display:'flex',fontSize:30,fontWeight:800,letterSpacing:5,color:'#24d79e'}}>CUT</div>
  </div>,size,
 );
}
