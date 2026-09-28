export const MARKETPLACE_REUSE_MS=15*60*1000;
export type ReusableMarketplaceJob={runId?:string;state:string;startedAt:number;inputKey?:string;successful?:boolean;batch?:number};
// Reuse only this visitor's completed, successful run for the identical provider input.
// No cross-account cache, broadened filters, or extension of the freshness window.
export function reusableMarketplaceJob(job:ReusableMarketplaceJob|undefined,inputKey:string,now=Date.now()){
 return !!job?.runId&&job.state==='IMPORTED'&&job.successful===true&&job.inputKey===inputKey&&Number.isFinite(job.startedAt)&&now>=job.startedAt&&now-job.startedAt<MARKETPLACE_REUSE_MS;
}
