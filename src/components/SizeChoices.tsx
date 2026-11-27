'use client';
import {useState} from 'react';
import {HouseChoices} from './HouseChoices';
import {sizeConfiguration, sizeOptions} from '../lib/jewellery-sizes';

/** Size choices for a setting (ring size, chain or bracelet length, case and wrist, stone weight). */
export function useSizes(setting: string, stone = false) {
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const options = sizeOptions(setting, {stone});
  const set = (key: string, value: string) => setChosen(c => ({...c, [key]: value}));
  return {options, chosen, set, configuration: sizeConfiguration(options, chosen), reset: () => setChosen({})};
}

export function SizeChoices({sizes}: {sizes: ReturnType<typeof useSizes>}) {
  if (!sizes.options.length) return null;
  return <div data-size-choices>
    {sizes.options.map(o => <HouseChoices key={o.key} label={o.label} value={sizes.chosen[o.key] ?? ''} choices={o.choices} onChange={v => sizes.set(o.key, v)}/>)}
  </div>;
}
