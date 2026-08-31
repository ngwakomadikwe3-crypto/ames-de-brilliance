export type Product = {
  id: string;
  name: string;
  category: "ring" | "necklace" | "earring" | "bracelet";
  tagline: string;
  kind: "hintspo" | "glb" | "jewelshop";
  src?: string;
  tryOn: true;
  gem?: string;
  metal?: string;
  ring?: string;
  modelUrl?: string;
  image?: string;
};

export const products: Product[] = [
  { id: "crystal-tear", name: "Crystal Tear", tagline: "A quiet brilliance, suspended in light.", category: "ring", kind: "hintspo", src: "https://hintspo.com/embed/510a50d8-5578-4821-95ab-f87fe3b770c3", tryOn: true },
  { id: "sky-lady", name: "Sky Lady", tagline: "Airborne colour with a celestial line.", category: "ring", kind: "hintspo", src: "https://hintspo.com/embed/4fc48834-9c38-47d6-9582-6e602396f27b", tryOn: true },
  { id: "house-emerald", name: "The House Emerald", tagline: "A green heart, haloed in light.", category: "ring", kind: "jewelshop", src: "", gem: "emerald", metal: "gold", ring: "0", tryOn: true },
  { id: "house-diamond", name: "The House Diamond", tagline: "The classic, cut to catch the sun.", category: "ring", kind: "jewelshop", src: "", gem: "diamond", metal: "silver", ring: "0", tryOn: true },
  { id: "house-demo-stone", name: "House Demo Stone", tagline: "A study in light and proportion.", category: "ring", kind: "glb", src: "/models/chat-diamond.glb", modelUrl: "/models/chat-diamond.glb", tryOn: true },
];
