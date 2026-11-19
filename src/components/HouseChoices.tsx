'use client';
export const diamondCuts = ['Round','Princess','Emerald','Asscher','Cushion','Marquise','Radiant','Oval','Pear','Heart'];
export function HouseChoices({label, value, choices, onChange}:{label:string;value:string;choices:Record<string,string>;onChange:(v:string)=>void}) {
  return <details className="my-2 border-b border-white/15 text-sm">
    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3"><span>{label}</span><span>{choices[value]} ⌄</span></summary>
    <div role="group" aria-label={label} className="flex flex-wrap gap-1 pb-3">{Object.entries(choices).map(([id,name]) =>
      <button key={id} type="button" aria-pressed={id===value} className={'min-h-11 rounded-full px-3 '+(id===value?'bg-white/15':'')} onClick={e=>{onChange(id);const parent=e.currentTarget.closest('details');if(parent){parent.open=false;parent.querySelector('summary')?.focus();}}}>{name}</button>)}</div>
  </details>;
}
