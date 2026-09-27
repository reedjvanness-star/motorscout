import {Info} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {Source} from '@/lib/domain';
export function SearchCoverage({sources,notice='',count=0,onDetails}:{sources:Source[];notice?:string;count?:number;onDetails:()=>void}){
 const errors=sources.filter(source=>source.status==='error');
 if(!errors.length&&!notice)return null;
 const limited=/quota|rate.*limit|allowance|credit|429/i.test([notice,...errors.map(source=>source.detail)].join(' '));
 return <div className="search-coverage" role="status"><Info size={18}/><div><strong>{limited?'Live inventory is temporarily limited':'Some marketplaces couldn’t be checked'}</strong><p>{count?'Keep exploring your collected cars. This search may be incomplete.':'An incomplete search does not mean there are no cars matching your requirements.'} Your filters stay unchanged.</p>{notice&&<p>{notice}</p>}</div><Button variant="ghost" size="sm" onClick={onDetails}>See source status</Button></div>;
}
