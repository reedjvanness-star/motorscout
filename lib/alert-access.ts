// Enable only after the provider approves scheduled retrieval and stored alert results.
export function approvedAlertKeys(settings:Record<string,any>,keys:{marketcheck?:string;autodev?:string}){
 return {
  marketcheck:settings.MARKETCHECK_ALERTS_APPROVED==='true'?keys.marketcheck:undefined,
  autodev:settings.AUTODEV_ALERTS_APPROVED==='true'?keys.autodev:undefined,
 };
}
