import assert from 'node:assert/strict';
import {basic} from '../lib/basic-parser';
import {initialFilters,filterSchema,matches} from '../lib/domain';
import {canonicalVehicle,canonicalListingVehicle,trimMatches} from '../lib/vehicle-identity';
import {normalizeMarketcheck} from '../lib/marketcheck';
import {normalizeAutoDev} from '../lib/autodev';
import {normalizeMarketplace} from '../lib/apify';
for(const text of ['BMW M550i','m550i','find me a BMW M550i','BMW M 550 i']){
 const parsed=basic(text,initialFilters);
 assert.equal(parsed.question,'');assert.equal(parsed.filters.make,'BMW');assert.equal(parsed.filters.model,'5 Series');assert.equal(parsed.filters.trim,'M550i');
}
const explicit=basic('BMW 5 Series M550i xDrive',initialFilters);
assert.equal(explicit.question,'');assert.equal(explicit.filters.model,'5 Series');assert.equal(explicit.filters.trim,'M550i xDrive');
for(const model of ['M550i','BMW M550i','m 550 i']){
 const f=filterSchema.parse({model});assert.equal(f.make,'BMW');assert.equal(f.model,'5 Series');assert.equal(f.trim,'M550i');
}
assert.deepEqual(canonicalVehicle({make:'BMW',model:'M550i',trim:'xDrive'}),{make:'BMW',model:'5 Series',trim:'M550i xDrive'});
assert.equal(canonicalVehicle({make:'BMW',model:'M5',trim:''}).model,'M5');
assert.equal(canonicalVehicle({make:'BMW',model:'550i',trim:''}).model,'550i','never convert the non-M variant to M550i');
assert(trimMatches('M550i xDrive','M550i'));
assert(!trimMatches('550i xDrive','M550i'));
assert(!trimMatches('M5','M550i'));
assert(!trimMatches('M550i','M550i xDrive'),'missing xDrive evidence cannot satisfy an explicitly requested suffix');
const wanted=filterSchema.parse({make:'BMW',model:'M550i'});
const providerRows=[
 normalizeMarketcheck({price:35000,vdp_url:'https://dealer.example/car',build:{make:'BMW',model:'M550i',year:2021},inventory_type:'used'},false)!,
 normalizeAutoDev({vehicle:{make:'BMW',model:'M550i',year:2021},retailListing:{used:true,price:35000,vdp:'https://dealer.example/auto'}})!,
 normalizeMarketplace({url:'https://www.cargurus.com/details/123',brand:'BMW',model:'5 Series',vehicleConfiguration:'M550i xDrive',vehicleModelDate:2021,offers:{price:35000,priceCurrency:'USD'}})!,
];
for(const input of providerRows){const row=canonicalListingVehicle(input);assert.equal(row.model,'5 Series');assert(matches(row,wanted));assert(!matches({...row,model:'M5',trim:''},wanted));assert(!matches({...row,trim:'550i xDrive'},wanted));}
const noTrim={...providerRows[2],make:'BMW',model:'5 Series',trim:''};
for(const title of ['2021 BMW M550i xDrive','Used 2021 BMW 5 Series M550i xDrive Sedan','BMW M550i'])assert(matches(canonicalListingVehicle({...noTrim,title}),wanted),'explicit title badge recovers omitted trim');
for(const title of ['2021 BMW 550i with M550i styling','2021 BMW 5 Series','Similar to BMW M550i','2021 BMW M5'])assert.equal(canonicalListingVehicle({...noTrim,title}).trim,'','incidental or different badges cannot establish M550i');
assert.equal(canonicalListingVehicle({...noTrim,title:'2021 BMW M550i xDrive',trim:'550i'}).trim,'550i','explicit conflicting trim is not overwritten');
assert.equal(canonicalListingVehicle({...noTrim,title:'2021 BMW M550i xDrive',model:'M5'}).model,'M5','explicit conflicting model is not overwritten');
console.log('PASS: BMW M550i request aliases, exact variants, provider model/trim reconciliation and title-only missing-trim evidence');

const conflictingBadge=canonicalListingVehicle({...noTrim,model:'M550i',trim:'550i',title:'2021 BMW M550i'});
assert(!matches(conflictingBadge,wanted),'conflicting explicit model and trim cannot manufacture an M550i match');

assert.deepEqual(canonicalVehicle({make:'BMW',model:'M550i xDrive',trim:'Base'}),{make:'BMW',model:'5 Series',trim:'M550i xDrive Base'},'model suffix evidence survives populated generic trim');
assert.equal(canonicalVehicle({make:'BMW',model:'M550i xDrive',trim:'M550i'}).trim,'M550i xDrive');
const wantXDrive=filterSchema.parse({make:'BMW',model:'5 Series',trim:'M550i xDrive'});
const xDriveRows=[
 normalizeMarketcheck({price:35000,vdp_url:'https://dealer.example/xdrive',build:{make:'BMW',model:'M550i xDrive',trim:'Base',year:2021},inventory_type:'used'},false)!,
 normalizeAutoDev({vehicle:{make:'BMW',model:'M550i xDrive',trim:'Base',year:2021},retailListing:{used:true,price:35000,vdp:'https://dealer.example/auto-xdrive'}})!,
 normalizeMarketplace({url:'https://www.cargurus.com/details/124',brand:'BMW',model:'M550i xDrive',vehicleConfiguration:'Base',vehicleModelDate:2021,offers:{price:35000,priceCurrency:'USD'}})!,
];
for(const row of [...providerRows,...xDriveRows]){
 assert.equal(row.model,'5 Series','provider normalization applies canonical identity directly');
 assert(matches(row,wanted));
}
for(const row of xDriveRows)assert(matches(row,wantXDrive),'provider model suffix remains exact xDrive evidence');
assert(matches({...noTrim,model:'M550i',trim:''},wanted),'legacy cached raw model variants recover without a new provider request');
assert(matches({...noTrim,model:'M550i xDrive',trim:'Base'},wantXDrive),'legacy raw model suffix survives populated generic trim');
assert(matches({...noTrim,title:'2021 BMW M550i xDrive'},wantXDrive),'legacy title evidence recovers missing trim');
