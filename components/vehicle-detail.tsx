import {Bookmark,X,Plus,ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {PriceStatus} from '@/components/price-status';
import {MarketValue} from '@/components/market-value';
import {money,type Listing} from '@/lib/domain';
import {VehicleGallery} from './vehicle-gallery';

export function VehicleDetail({car,pool,onOpen,busy,saved,compared,onSave,onCompare}:{car:Listing;pool:Listing[];onOpen:(car:Listing)=>void;busy:boolean;saved:boolean;compared:boolean;onSave:()=>void;onCompare:()=>void}){
 const specs=[['Mileage',car.miles===null?'Not provided':car.miles.toLocaleString()+' miles'],['Location',[car.city,car.state].filter(Boolean).join(', ')],['Trim',car.trim],['Exterior',car.exteriorColor],['Transmission',car.transmission],['Drivetrain',car.drive],['Fuel',car.fuel],['Body style',car.bodyType],['Seller',car.seller==='unknown'?'Not provided':car.seller],['Title',car.titleStatus==='unknown'?'Not provided':car.titleStatus]];
 return <div className="vehicle-detail-content">
  <VehicleGallery key={car.id} car={car}/>
  <div className="vehicle-overview"><div><p className="vehicle-source">Listed on {car.source}</p><h2>{car.priceWarning?'Full price unavailable':money(car.price)}</h2><p className="helper">{car.priceWarning?'Seller confirmation needed':'Asking price · confirm taxes and fees with the seller'}</p></div><div className="car-actions"><Button variant="outline" disabled={busy} aria-pressed={saved} onClick={onSave}>{saved?<X/>:<Bookmark/>}{saved?'Remove from saved':'Save car'}</Button><Button variant="outline" disabled={busy} aria-pressed={compared} onClick={onCompare}>{compared?<X/>:<Plus/>}{compared?'Remove from compare':'Compare'}</Button></div></div>
  <dl className="vehicle-specs">{specs.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Not provided'}</dd></div>)}</dl>
  {!!car.features?.length&&<section><h3>Listed equipment</h3><div className="vehicle-features">{car.features.map(feature=><span key={feature}>{feature}</span>)}</div></section>}
  <section><h3>Price details</h3><PriceStatus car={car}/>{car.priceWarning&&<p className="price-warning">{car.priceWarning}</p>}<dl className="vehicle-price-lines"><div><dt>Asking price</dt><dd>{car.priceWarning?'Unconfirmed':money(car.price)}</dd></div><div><dt>Disclosed seller fees</dt><dd>{car.fees===null?'Not provided':money(car.fees)}</dd></div><div><dt>Known subtotal</dt><dd>{car.priceWarning?'Unconfirmed':money(car.total)}</dd></div></dl></section>
  <MarketValue car={car} pool={pool} expanded onOpen={onOpen}/>
  <details className="vehicle-extra"><summary>Listing information & checks</summary>{car.evidenceText&&<p className="vehicle-description">{car.evidenceText.slice(0,4000)}</p>}<p>{car.vin?'VIN: '+car.vin:'VIN not provided'}</p><ul>{car.concerns.map(c=><li key={c}>{c}</li>)}</ul><p className="helper">Checked {new Date(car.checkedAt).toLocaleString()}. Seller update: {car.sourceUpdatedAt||'not provided'}.</p></details>
  {!!car.comparables.length&&<details className="vehicle-extra"><summary>Comparable cars</summary><p>{car.reason}</p>{car.comparables.map(c=><p key={c.id}><a href={c.url} target="_blank" rel="noopener noreferrer">{c.title} · {money(c.price)} ↗</a></p>)}</details>}
  {(car.offers?.length??0)>1&&<details className="vehicle-extra"><summary>Other listings for this car</summary>{car.offers!.map(o=><p key={o.url}><a href={o.url} target="_blank" rel="noopener noreferrer">{o.source} · {o.priceWarning?'Price unconfirmed':money(o.price)} ↗</a></p>)}</details>}
  <div className="vehicle-seller-link"><p>Ready to contact the seller?</p><a className="primary-link" href={car.url} target="_blank" rel="noopener noreferrer">Visit seller’s listing <ArrowUpRight size={17}/></a></div>
 </div>;
}
