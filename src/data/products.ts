export type Product = {
  id: string;
  name: string;
  tagline: string;
  kind: "hintspo" | "glb";
  src: string;
  tryOn: true;
};

export const products: Product[] = [
  { id: "crystal-tear", name: "Crystal Tear", tagline: "A quiet brilliance, suspended in light.", kind: "hintspo", src: "https://hintspo.com/embed/510a50d8-5578-4821-95ab-f87fe3b770c3", tryOn: true },
  { id: "sky-lady", name: "Sky Lady", tagline: "Airborne colour with a celestial line.", kind: "hintspo", src: "https://hintspo.com/embed/4fc48834-9c38-47d6-9582-6e602396f27b", tryOn: true },
];
