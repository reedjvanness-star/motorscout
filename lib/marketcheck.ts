import {photoUrls} from './vehicle-photos';
import {knownFeatures} from './vehicle-requirements';
import {safeUrl, priceWarning, type Filters, type Listing} from './domain';

export const MARKETCHECK_PAGE_SIZE = 50;
export function marketcheckUrl(f: Filters, privateSeller: boolean, offset = 0, auction = false) {
  const u = new URL(`https://api.marketcheck.com/v2/search/car/${auction ? 'auction/' : privateSeller ? 'fsbo/' : ''}active`);
  const p = u.searchParams;
  p.set('rows', String(MARKETCHECK_PAGE_SIZE));
  p.set('start', String(offset));
  p.set('car_type', 'used');
  p.set('country', 'us');
  p.set('append_api_key', 'false');
  p.set('sort_by', 'price');
  p.set('sort_order', 'asc');
  p.set('has_price', 'true');
  if(f.exteriorColor)p.set(/^[a-z]+$/i.test(f.exteriorColor)?'base_ext_color':'exterior_color',f.exteriorColor);
  if(f.bodyType)p.set('body_type',f.bodyType==='pickup'?'Pickup':f.bodyType);
  if(f.cabStyle)p.set('body_subtype',f.cabStyle==='crew'?'Crew':f.cabStyle==='extended'?'Extended':'Regular');
  if(f.fuel)p.set('fuel_type',({gasoline:'Unleaded,Premium Unleaded',diesel:'Diesel',electric:'Electric',hybrid:'Electric / Unleaded,Electric / Premium Unleaded'} as const)[f.fuel]);
  if(f.transmission)p.set('transmission',f.transmission);
  if(f.features?.length)p.set('high_value_features',f.features.map(x=>x==='sunroof'?'Sun/moonroof':x).join(','));
  if(f.drivetrain)p.set('drivetrain',f.drivetrain.toUpperCase());
  if(f.zip){p.set('zip',f.zip);p.set('radius',String(f.radiusMiles));}
  for (const k of ['make', 'model', 'trim', 'state'] as const) if (f[k]) p.set(k, f[k]);
  if (f.maxPrice !== null) p.set('price_range', `1-${Math.max(1, f.maxPrice - f.shippingAllowance)}`);
  if (f.maxMiles !== null) p.set('miles_range', `0-${f.maxMiles}`);
  if (f.minYear !== null) p.set('year_range', `${f.minYear}-2030`);
  if (f.awd) p.set('drivetrain', 'AWD');
  if (f.cleanTitle) p.set('carfax_clean_title', 'true');
  return u;
}

export function autotraderMarketcheckUrl(f:Filters,offset=0){
 const url=marketcheckUrl(f,false,offset);url.pathname='/v2/dealerships/inventory';
 url.searchParams.set('source','autotrader.com');url.searchParams.set('rows','10');
 // This endpoint does not document these filters; require listing evidence locally.
 url.searchParams.delete('high_value_features');url.searchParams.delete('carfax_clean_title');
 return url;
}
export function normalizeAutotraderMarketcheck(x:any):Listing|null{
 const url=safeUrl(x?.vdp_url);if(!url)return null;
 const u=new URL(url);if(!['autotrader.com','www.autotrader.com'].includes(u.hostname)||!/^\/cars-for-sale\/vehicle\/\d+\/?$/.test(u.pathname)||x.inventory_type!=='used')return null;
 const category=String(x.mc_dealership?.mc_category??'').toUpperCase();
 const row=normalizeMarketcheck(x,category==='FSBO');if(!row)return null;
 const seller=category==='FSBO'?'private':['franchise','independent'].includes(String(x.dealer?.type??x.mc_dealership?.type).toLowerCase())?'dealer':'unknown';
 return {...row,source:'AutoTrader',seller,state:String(x.car_location?.state??row.state).toUpperCase(),city:String(x.car_location?.city??row.city),concerns:[...row.concerns,'AutoTrader listing supplied by MarketCheck. Coverage and freshness depend on its feed.']};
}

function number(v: unknown): number | null {
  if ((typeof v !== 'number' && typeof v !== 'string') || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function normalizeMarketcheck(x: any, privateSeller: boolean): Listing | null {
  if (!x || typeof x !== 'object') return null;
  const url = safeUrl(x.vdp_url), price = number(x.price), b = x.build ?? {};
  if (!url || price === null || price <= 0 || x.inventory_type === 'new') return null;
  const title = String(x.heading ?? [b.year, b.make, b.model, b.trim].filter(Boolean).join(' '));
  if (!title || /down payment|per month|\/mo\b|monthly payment/i.test(title)) return null;
  const disclosedFees = number(x.fees);
  // An included fee is already in the asking price. Ambiguous fee inclusion
  // stays unknown; do not silently assert an all-in price.
  const fees = disclosedFees === 0 ? 0 : x.price_includes_fees === true ? 0 : x.price_includes_fees === false ? disclosedFees : null;
  const concerns = ['Confirm availability and full cash asking price with the seller.'];
  if (disclosedFees !== null && disclosedFees > 0) concerns.push(x.price_includes_fees === true
    ? `The provider reports $${disclosedFees} in fees already included in the asking price; other costs may apply.`
    : x.price_includes_fees === false ? `The provider reports $${disclosedFees} in additional fees.`
    : `The provider reports $${disclosedFees} in fees but does not say whether they are included in the asking price.`);
  if (x.carfax_clean_title === true) concerns.push('Clean title is reported by the listing provider. Verify the vehicle history independently.');
  return {
    id: `marketcheck:${String(x.id ?? url)}`, vin: typeof x.vin === 'string' ? x.vin : null,
    title, make: String(b.make ?? ''), model: String(b.model ?? ''), trim: String(b.trim ?? ''),
    evidenceText:[title,String(x.seller_comments??x.description??''),...(Array.isArray(x.features)?x.features.map((v:any)=>String(v?.name??v)):[])].join('\n'),exteriorColor:String(x.exterior_color??x.base_ext_color??''),baseExteriorColor:String(x.base_ext_color??''),bodyType:String(b.body_type??''),cabStyle:String(b.body_subtype??x.body_subtype??''),fuel:String(b.fuel_type??''),transmission:String(b.transmission??''),features:knownFeatures([...(Array.isArray(x.high_value_features)?x.high_value_features:[]),...(Array.isArray(x.extra?.features)?x.extra.features:[])]),
    year: number(b.year), priceWarning:priceWarning(price,number(b.year)), price, miles: number(x.miles),
    state: String(x.dealer?.state ?? x.seller?.state ?? x.state ?? '').toUpperCase(),
    city: String(x.dealer?.city ?? x.seller?.city ?? x.city ?? ''),
    source: new URL(url).hostname, url, photo: safeUrl(x.media?.photo_links?.[0]), photosSourceUrl:url,photos:photoUrls(x.media?.photo_links),
    seller: privateSeller ? 'private' : 'dealer', drive: String(b.drivetrain ?? ''),
    titleStatus: x.carfax_clean_title === true ? 'clean' : 'unknown', condition: 'used', history: 'unknown',
    fees, checkedAt: new Date().toISOString(), sourceUpdatedAt: typeof x.last_seen_at_date === 'string' ? x.last_seen_at_date : null,
    concerns, comparables: [], median: null, reason: '', total: price + (fees ?? 0),
  };
}
