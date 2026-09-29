import {config,db} from './server';
import {cachedInventory} from './inventory-cache';
import {firstResults} from './first-results';
import {inventoryStatus, type InventoryKeys} from './inventory';
import {type Filters, type SearchCursor} from './domain';

function configured(keys:InventoryKeys):InventoryKeys {
  return {marketcheck:keys.marketcheck??config().MARKETCHECK_API_KEY,autodev:keys.autodev??config().AUTODEV_API_KEY};
}
export const sourceStatus=(keys:InventoryKeys={})=>inventoryStatus(configured(keys));
export const searchListings=(f:Filters,keys:InventoryKeys={},cursor?:SearchCursor,quickFirst=false)=>quickFirst&&!cursor?firstResults(f,configured(keys),(filters,creds,position)=>cachedInventory(db(),filters,creds,position)):cachedInventory(db(),f,configured(keys),cursor);
