import assert from 'node:assert/strict';
import {localScoutCommand} from '../lib/local-scout-command';
for(const text of ['Compare cars','Compare my selected cars','Compare the cheapest cars in my results',' compare my saved cars! '])assert.equal(localScoutCommand(text),'compare');
for(const text of ['Compare cars under $30k','Compare my selected cars but only AWD','Find cars','Compare a BMW to an Audi','Do not compare cars'])assert.equal(localScoutCommand(text),null);
console.log('PASS: local comparison shortcuts never swallow additional requirements');
