'use client';
import {useId,useState} from 'react';
import {Check,ChevronDown} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './ui/popover';
import {Command,CommandInput,CommandList,CommandGroup,CommandItem} from './ui/command';

const commonMakes=new Set(['Audi','BMW','Chevrolet','Dodge','Ford','GMC','Honda','Hyundai','Jeep','Kia','Lexus','Mazda','Mercedes-Benz','Nissan','Ram','Subaru','Tesla','Toyota','Volkswagen']);
export function VehiclePicker({field,value,suggestions,onChange,disabled=false}:{field:string;value:string;suggestions:string[];onChange:(value:string)=>void;disabled?:boolean}){
 const id=useId(),[open,setOpen]=useState(false),[query,setQuery]=useState('');
 const choices=[...new Set(suggestions)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
 const visible=choices.filter(v=>v.toLowerCase().replace(/[^a-z0-9]/g,'').includes(query.toLowerCase().replace(/[^a-z0-9]/g,'')));
 const common=field==='Make'&&!query?visible.filter(v=>commonMakes.has(v)):[];
 const rest=common.length?visible.filter(v=>!commonMakes.has(v)):visible;
 const choose=(next:string)=>{onChange(next);setOpen(false);setQuery('')};
 const item=(name:string)=><CommandItem key={name} value={name} onSelect={()=>choose(name)}>{name}{value===name&&<Check className="ml-auto"/>}</CommandItem>;
 return <div className="field vehicle-picker"><label id={id}>{field}</label><Popover open={open} onOpenChange={next=>{setOpen(next);setQuery('')}}><PopoverTrigger asChild><button type="button" className="input-button" role="combobox" aria-labelledby={id} aria-expanded={open} aria-controls={`${id}-options`} disabled={disabled}><span>{value||`Any ${field.toLowerCase()}`}</span><ChevronDown size={16}/></button></PopoverTrigger><PopoverContent className="vehicle-picker-menu" align="start"><Command shouldFilter={false}><CommandInput aria-label={`Search ${field.toLowerCase()}`} placeholder={`Search ${field.toLowerCase()}…`} value={query} maxLength={field==='Make'?40:60} onValueChange={setQuery}/><CommandList id={`${id}-options`}><CommandGroup><CommandItem value="__any" onSelect={()=>choose('')}>Any {field.toLowerCase()}{!value&&<Check className="ml-auto"/>}</CommandItem></CommandGroup>{common.length>0&&<CommandGroup heading="Common makes">{common.map(item)}</CommandGroup>}{rest.length>0&&<CommandGroup heading={field==='Make'?(common.length?'More makes':'All makes'):`All ${field.toLowerCase()}s`}>{rest.map(item)}</CommandGroup>}{query.trim()&&!choices.some(v=>v.toLowerCase()===query.trim().toLowerCase())&&<CommandGroup heading="Not in the list?"><CommandItem value="__custom" onSelect={()=>choose(query.trim())}>Search for “{query.trim()}”</CommandItem></CommandGroup>}</CommandList></Command></PopoverContent></Popover></div>;
}
