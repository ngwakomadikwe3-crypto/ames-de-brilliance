'use client';
import {useSyncExternalStore} from 'react';
import translations from './atelier-translations.json';
const key='ames-atelier-language';
const words:Record<string,string>={Gemstones:'Pierres précieuses','Search gemstones':'Rechercher une pierre','Explore settings':'Voir les montures','View in 3D':'Vue en 3D', Personalise:'Personnaliser',Diamonds:'Diamants',Metal:'Métal',Silver:'Argent',Gold:'Or',Necklace:'Collier',Necklaces:'Colliers',Ring:'Bague',Rings:'Bagues',Earrings:"Boucles d’oreilles",Bracelet:'Bracelet',Bracelets:'Bracelets',Watch:'Montre',Watches:'Montres','Loose gemstone':'Pierre seule','Drop cut':'Taille des pendeloques','Centre cut':'Taille centrale','Case shape':'Forme du boîtier',Cut:'Taille',Original:"D’origine",Round:'Rond',Oval:'Ovale',Pear:'Poire',Cushion:'Coussin',Princess:'Princesse',Heart:'Cœur',Emerald:'Émeraude',Square:'Carré','Slim rectangle':'Rectangle fin',Colourless:'Incolore',Blue:'Bleu',Pink:'Rose',Yellow:'Jaune',Green:'Vert',Purple:'Violet',Brown:'Brun','Yellow & pink':'Jaune et rose','Pear-drop fringe necklace':'Collier à pampilles poire','Pavé solitaire':'Solitaire pavé',Amethyst:'Améthyste',Amber:'Ambre',Alexandrite:'Alexandrite',Aquamarine:'Aigue-marine',Ametrine:'Amétrine',Diamond:'Diamant',Garnet:'Grenat',Moonstone:'Pierre de lune',Pearl:'Perle',Ruby:'Rubis',Sapphire:'Saphir',Opal:'Opale',Spinel:'Spinelle',Sunstone:'Pierre de soleil','Rose Quartz':'Quartz rose',Peridot:'Péridot',Topaz:'Topaze','Request a made-to-order quote':'Demander un devis sur mesure','Find your ring size':'Mesurer votre tour de doigt','Measure your wrist':'Mesurer votre poignet','Part of the HOUSEofAMES collection. Our manufacturing partners make each commissioned piece for HOUSEofAMES.':'Une création HOUSEofAMES, réalisée sur commande par nos partenaires de fabrication.'};
const names:Record<string,string>={en:'English',fr:'Français',ar:'العربية',zh:'中文（简体）',es:'Español',ja:'日本語',af:'Afrikaans',it:'Italiano'};
const dictionaries:Record<string,Record<string,string>>={fr:{...words,Language:'Langue'},...translations};
function read(){try{const value=localStorage.getItem(key)??'en';return Object.prototype.hasOwnProperty.call(names,value)?value:'en'}catch{return 'en'}}
function subscribe(fn:()=>void){window.addEventListener('storage',fn);window.addEventListener(key,fn);return ()=>{window.removeEventListener('storage',fn);window.removeEventListener(key,fn)}}
export function useAtelierLanguage(){const lang=useSyncExternalStore(subscribe,read,()=>'en');return {lang,t:(v:string)=>dictionaries[lang]?.[v]??v};}
export function LanguageSetting(){
  const {lang,t}=useAtelierLanguage();
  return <label dir={lang==='ar'?'rtl':undefined} className="flex items-center justify-between gap-4 py-3">{t('Language')}
    <select value={lang} className="min-h-11 rounded-xl bg-[#10372f] px-3 text-base" onChange={e=>{localStorage.setItem(key,e.target.value);window.dispatchEvent(new Event(key));}}>
      {Object.entries(names).map(([code,name])=><option lang={code} key={code} value={code}>{name}</option>)}
    </select>
  </label>;
}
