import type { ImgHTMLAttributes } from "react";
export default function Image({priority,fill,alt="",...props}:ImgHTMLAttributes<HTMLImageElement>&{priority?:boolean;fill?:boolean}) {
  // Native WebKit loads bundled local assets; a Next image server is not present.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} loading={priority?"eager":props.loading} style={fill?{...props.style,position:"absolute",inset:0,width:"100%",height:"100%"}:props.style}/>;
}
