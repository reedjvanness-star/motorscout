import modelCatalog from './vehicle-models.json';
// Common US used-car choices, not a claim of current inventory availability.
export const curatedVehicles:Record<string,Record<string,string[]>>={
 BMW:{'3 Series':['330i','330i xDrive','M340i','M340i xDrive'],'5 Series':['530i','530i xDrive','540i','540i xDrive','550i','550i xDrive','M550i','M550i xDrive'],'2 Series':['230i','M240i','M240i xDrive'],'4 Series':['430i','M440i'],'M3':['Base','Competition'],'M4':['Base','Competition'],'X3':['sDrive30i','xDrive30i','M40i'],'X5':['xDrive40i','M50i']},
 Subaru:{Crosstrek:['Base','Premium','Sport','Limited','Wilderness'],Outback:['Base','Premium','Onyx Edition','Limited','Touring','Wilderness'],Forester:['Base','Premium','Sport','Limited','Touring','Wilderness'],Impreza:['Base','Sport','RS'],WRX:['Base','Premium','Limited','GT'],BRZ:['Premium','Limited']},
 Toyota:{Camry:['LE','SE','XLE','XSE','TRD'],Corolla:['L','LE','SE','XLE','XSE'],RAV4:['LE','XLE','XLE Premium','Adventure','Limited','TRD Off-Road'],Tacoma:['SR','SR5','TRD Sport','TRD Off-Road','Limited','TRD Pro'],'4Runner':['SR5','SR5 Premium','TRD Off-Road','Limited','TRD Pro'],Tundra:['SR','SR5','Limited','Platinum','1794 Edition','TRD Pro'],Prius:['LE','XLE','Limited']},
 Honda:{Civic:['LX','Sport','EX','EX-L','Touring','Si','Type R'],Accord:['LX','Sport','EX','EX-L','Touring'],'CR-V':['LX','EX','EX-L','Touring'],'HR-V':['LX','Sport','EX-L'],Pilot:['LX','EX','EX-L','Touring','Elite'],Odyssey:['LX','EX','EX-L','Touring','Elite']},
 Ford:{'F-150':['XL','XLT','Lariat','King Ranch','Platinum','Limited','Raptor'],Mustang:['EcoBoost','EcoBoost Premium','GT','GT Premium','Mach 1','Dark Horse'],Bronco:['Base','Big Bend','Black Diamond','Outer Banks','Badlands','Wildtrak'],'Bronco Sport':['Base','Big Bend','Outer Banks','Badlands'],Explorer:['Base','XLT','Limited','ST','Platinum'],Escape:['S','SE','SEL','Titanium'],Ranger:['XL','XLT','Lariat']},
 Chevrolet:{'Silverado 1500':['WT','Custom','LT','RST','LTZ','High Country','ZR2'],Colorado:['WT','LT','Z71','ZR2'],Tahoe:['LS','LT','RST','Z71','Premier','High Country'],Equinox:['LS','LT','Premier'],Camaro:['1LT','2LT','3LT','LT1','1SS','2SS','ZL1'],Corvette:['Stingray','Grand Sport','Z06']},
 Audi:{A6:[],A7:[],A8:[],S5:[],S6:[],S7:[],S8:[],SQ5:[],SQ7:[],SQ8:[],RS3:[],RS4:[],RS5:[],RS6:[],RS7:[],'RS Q8':[],TT:[],TTS:[],'TT RS':[],R8:[],A3:['Premium','Premium Plus','Prestige'],A4:['Premium','Premium Plus','Prestige'],A5:['Premium','Premium Plus','Prestige'],S3:['Premium','Premium Plus','Prestige'],S4:['Premium','Premium Plus','Prestige'],Q3:['Premium','Premium Plus'],Q5:['Premium','Premium Plus','Prestige'],Q7:['Premium','Premium Plus','Prestige']},
 'Mercedes-Benz':{
  '190-Class':['190 E','190 D','190 E 2.3-16','190 E 2.6'],'300-Class':['300 D','300 E','300 CE','300 TE','300 SE','300 SEL','300 SD','300 SDL'],
  'A-Class':['A 220','A 220 4MATIC'],'B-Class':['B 250e','Electric Drive'],
  'C-Class':['C 230','C 240','C 250','C 280','C 300','C 300 4MATIC','C 320','C 350','C 350e','C 32 AMG','C 43 AMG','C 55 AMG','C 63 AMG','AMG C 43','AMG C 63','AMG C 63 S','AMG C 63 S E Performance'],
  'CL-Class':['CL 500','CL 550','CL 600','CL 55 AMG','CL 63 AMG','CL 65 AMG'],
  'CLA-Class':['CLA 250','CLA 250 4MATIC','CLA 45 AMG','AMG CLA 35','AMG CLA 45','AMG CLA 45 S'],
  'CLE-Class':['CLE 300 4MATIC','CLE 450 4MATIC','AMG CLE 53'],
  'CLK-Class':['CLK 320','CLK 350','CLK 430','CLK 500','CLK 550','CLK 55 AMG','CLK 63 AMG','CLK 63 AMG Black Series'],
  'CLS-Class':['CLS 400','CLS 450','CLS 500','CLS 550','CLS 55 AMG','CLS 63 AMG','AMG CLS 53','AMG CLS 63','AMG CLS 63 S'],
  'E-Class':['E 250 BlueTEC','E 300','E 320','E 320 CDI','E 320 BlueTEC','E 350','E 350 BlueTEC','E 400','E 450','E 500','E 550','E 55 AMG','E 63 AMG','AMG E 43','AMG E 53','AMG E 63','AMG E 63 S'],
  'S-Class':['S 320','S 350','S 350 BlueTEC','S 400 Hybrid','S 420','S 430','S 450','S 500','S 550','S 560','S 580','S 600','S 55 AMG','S 63 AMG','S 65 AMG','AMG S 63','AMG S 65','AMG S 63 E Performance'],
  'SL-Class':['SL 320','SL 400','SL 450','SL 500','SL 550','SL 600','SL 55 AMG','SL 63 AMG','SL 65 AMG','SL 65 AMG Black Series','AMG SL 43','AMG SL 55','AMG SL 63'],
  'SLK-Class':['SLK 230','SLK 250','SLK 280','SLK 300','SLK 320','SLK 350','SLK 32 AMG','SLK 55 AMG'],
  'SLC-Class':['SLC 300','AMG SLC 43'],'SLS AMG':['Base','GT','Black Series'],'SLR McLaren':['Base','722 Edition','722 S'],
  'AMG GT':['Base','S','C','R','R Pro','Black Series','43','53','55','63','63 S','63 S E Performance'],
  'G-Class':['G 500','G 550','G 550 4x4 Squared','G 55 AMG','G 63 AMG','G 65 AMG','AMG G 63','AMG G 65','G 580 with EQ Technology'],
  'GL-Class':['GL 320 CDI','GL 320 BlueTEC','GL 350 BlueTEC','GL 450','GL 550','GL 63 AMG'],
  'GLA-Class':['GLA 250','GLA 250 4MATIC','GLA 45 AMG','AMG GLA 35','AMG GLA 45'],
  'GLB-Class':['GLB 250','GLB 250 4MATIC','AMG GLB 35'],
  'GLC-Class':['GLC 300','GLC 300 4MATIC','GLC 350e','AMG GLC 43','AMG GLC 63','AMG GLC 63 S','AMG GLC 63 S E Performance'],
  'GLE-Class':['GLE 350','GLE 350d','GLE 400','GLE 450','GLE 450e','GLE 550e','GLE 580','AMG GLE 43','AMG GLE 53','AMG GLE 63','AMG GLE 63 S'],
  'GLK-Class':['GLK 250 BlueTEC','GLK 350'],'GLS-Class':['GLS 350d','GLS 450','GLS 550','GLS 580','AMG GLS 63'],
  'M-Class':['ML 320','ML 320 CDI','ML 320 BlueTEC','ML 350','ML 350 BlueTEC','ML 400','ML 430','ML 450 Hybrid','ML 500','ML 550','ML 55 AMG','ML 63 AMG'],
  'R-Class':['R 320 CDI','R 320 BlueTEC','R 350','R 350 BlueTEC','R 500','R 63 AMG'],
  EQB:['250+','300 4MATIC','350 4MATIC'],EQE:['350','350+','350 4MATIC','500 4MATIC','AMG EQE'],EQS:['450+','450 4MATIC','580 4MATIC','AMG EQS'],
  'EQE SUV':['350+','350 4MATIC','500 4MATIC','AMG EQE SUV'],'EQS SUV':['450+','450 4MATIC','580 4MATIC'],
  'Metris':['Cargo','Passenger'],Sprinter:['1500','2500','3500','3500XD','4500']
 },
 Volkswagen:{Jetta:['S','Sport','SE','SEL'],Golf:['S','SE','SEL'],'Golf GTI':['S','SE','Autobahn'],'Golf R':['Base'],Tiguan:['S','SE','SEL'],Atlas:['SE','SEL']},
 Mazda:{'Mazda3':['Select','Preferred','Premium'],'CX-5':['Sport','Touring','Grand Touring','Signature'],'CX-30':['Select','Preferred','Premium'],'MX-5 Miata':['Sport','Club','Grand Touring']},
 Hyundai:{Elantra:['SE','SEL','Limited','N Line','N'],Sonata:['SE','SEL','Limited','N Line'],Tucson:['SE','SEL','Limited'],'Santa Fe':['SE','SEL','Limited','Calligraphy'],Kona:['SE','SEL','Limited','N Line'],'IONIQ 5':['SE','SEL','Limited']},
 Kia:{Forte:['FE','LXS','GT-Line','GT'],K5:['LXS','GT-Line','EX','GT'],Sportage:['LX','EX','SX','SX Prestige'],Telluride:['LX','S','EX','SX'],Sorento:['LX','S','EX','SX'],Soul:['LX','S','GT-Line','EX']},
 Nissan:{Altima:['S','SV','SR','SL'],Sentra:['S','SV','SR'],Rogue:['S','SV','SL','Platinum'],Frontier:['S','SV','PRO-4X'],Pathfinder:['S','SV','SL','Platinum'],'370Z':['Base','Sport','Touring','NISMO']},
 Tesla:{'Model 3':['Standard Range Plus','Long Range','Performance'],'Model Y':['Long Range','Performance'],'Model S':['Long Range','Plaid'],'Model X':['Long Range','Plaid']},
 Lexus:{IS:['IS 250','IS 300','IS 350','IS 500'],ES:['ES 350','ES 300h'],RX:['RX 350','RX 450h'],NX:['NX 300','NX 350','NX 350h'],GX:['GX 460','GX 550']},
 Acura:{ILX:['Base','Premium','Technology'],TLX:['Base','Technology','A-Spec','Advance','Type S'],RDX:['Base','Technology','A-Spec','Advance'],MDX:['Base','Technology','A-Spec','Advance','Type S'],Integra:['Base','A-Spec','Type S']},
 Jeep:{Wrangler:['Sport','Sport S','Sahara','Rubicon'],'Grand Cherokee':['Laredo','Limited','Overland','Summit'],Cherokee:['Latitude','Limited','Trailhawk'],Gladiator:['Sport','Sport S','Overland','Rubicon'],Compass:['Sport','Latitude','Limited','Trailhawk']},
 Ram:{'1500':['Tradesman','Big Horn','Laramie','Rebel','Limited','TRX'],'2500':['Tradesman','Big Horn','Laramie','Power Wagon','Limited']},
 GMC:{'Sierra 1500':['Pro','SLE','Elevation','SLT','AT4','Denali'],Canyon:['Elevation','AT4','Denali'],Yukon:['SLE','SLT','AT4','Denali'],Terrain:['SLE','SLT','Denali'],Acadia:['SLE','SLT','AT4','Denali']},
 Dodge:{Charger:['SXT','GT','R/T','Scat Pack','SRT Hellcat'],Challenger:['SXT','GT','R/T','R/T Scat Pack','SRT Hellcat'],Durango:['SXT','GT','R/T','Citadel','SRT']},
 Porsche:{'911':['Carrera','Carrera S','Carrera 4S','Turbo','GT3'],Macan:['Base','S','GTS'],Cayenne:['Base','S','GTS','Turbo'],'718 Cayman':['Base','S','GTS','GT4']},
 Volvo:{S60:['Momentum','Inscription','R-Design'],XC40:['Momentum','Inscription','R-Design'],XC60:['Momentum','Inscription','R-Design'],XC90:['Momentum','Inscription','R-Design']},
};
// Merge the public model snapshot without replacing curated trim relationships.
const nameKey=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
export const vehicles:Record<string,Record<string,string[]>>=Object.fromEntries(Object.entries(curatedVehicles).map(([make,models])=>[make,Object.fromEntries(Object.entries(models).map(([model,trims])=>[model,[...trims]]))]));
for(const [catalogMake,models] of Object.entries(modelCatalog.models)){
 const make=Object.keys(vehicles).find(value=>nameKey(value)===nameKey(catalogMake))??catalogMake;
 const target=vehicles[make]??(vehicles[make]={});
 for(const model of models){
  if(Object.keys(target).some(value=>nameKey(value)===nameKey(model)))continue;
  if(Object.values(curatedVehicles[make]??{}).some(trims=>trims.some(trim=>nameKey(trim)===nameKey(model))))continue;
  target[model]=[];
 }
}
export const states:[string,string][]=[['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];
export function options(values:string[],current:string,anyLabel:string):[string,string][]{return [['__any',anyLabel],...Array.from(new Set([...values,...(current?[current]:[])])).map(v=>[v,v] as [string,string])]}
