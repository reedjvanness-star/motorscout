import {DocumentLink} from './document-link';
import type {ReactNode} from 'react';
export function InfoPage({title,intro,children}:{title:string;intro:string;children:ReactNode}){
 return <main className="info-page"><DocumentLink className="info-back" href="/">← Back to MotorScout</DocumentLink><span className="heading-kicker">MOTORSCOUT · EARLY ACCESS</span><h1>{title}</h1><p className="info-intro">{intro}</p>{children}<nav aria-label="Help and policies"><DocumentLink href="/help">Help</DocumentLink><DocumentLink href="/privacy">Privacy</DocumentLink><DocumentLink href="/terms">Terms</DocumentLink></nav></main>;
}
