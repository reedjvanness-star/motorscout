import type {ReactNode} from 'react';

// These page transitions must work even before hydration or after a release.
// Native navigation also reloads the correct document and its matching assets.
export function DocumentLink({href,className,children}:{href:'/'|'/help'|'/privacy'|'/terms';className?:string;children:ReactNode}){
 return <a href={href} className={className}>{children}</a>;
}
