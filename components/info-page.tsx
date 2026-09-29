import Link from 'next/link';
import type {ReactNode} from 'react';
export function InfoPage({title,intro,children}:{title:string;intro:string;children:ReactNode}){
 return <main className="info-page"><Link className="info-back" href="/">← Back to MotorScout</Link><span className="heading-kicker">MOTORSCOUT · EARLY ACCESS</span><h1>{title}</h1><p className="info-intro">{intro}</p>{children}<nav aria-label="Help and policies"><Link href="/help">Help</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></main>;
}
