import assert from 'node:assert/strict';
import {sourceDisplay} from '../lib/source-display';
const unused={name:'Cars.com',status:'unavailable' as const,detail:'No direct integration'};
assert.equal(sourceDisplay(unused,true,'').label,'Connected · not checked yet');
assert.equal(sourceDisplay(unused,false,'').label,'Not connected');
assert.equal(sourceDisplay({...unused,name:'Facebook Marketplace'},true,'TX').label,'Outside current coverage');
assert.equal(sourceDisplay({...unused,name:'Newspaper classifieds'},true,'').label,'Not connected');
assert.equal(sourceDisplay({...unused,status:'error',detail:'HTTP 429 quota limit'},true,'').label,'Provider limit reached');
assert.equal(sourceDisplay({...unused,status:'searched',count:3},true,'').label,'Listings returned');
assert.equal(sourceDisplay({...unused,name:'MarketCheck · auctions',detail:'Excluded by your maximum-price filter.'},true,'').label,'Excluded by your filters');
console.log('PASS: connected marketplaces, missing credentials, regional coverage and provider limits');

for(const name of ['CarMax','AutoTrader'])assert.equal(sourceDisplay({...unused,name},true,'').label,'Not connected');
