import { type AnchorHTMLAttributes } from "react";
import { useRouter } from "./navigation";
export default function Link({href,...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {href:string}) {
  const router = useRouter();
  return <a {...props} href={href} onClick={e => { props.onClick?.(e); if(!e.defaultPrevented && href.startsWith("/") && !e.metaKey && !e.ctrlKey){e.preventDefault();router.push(href);} }} />;
}
