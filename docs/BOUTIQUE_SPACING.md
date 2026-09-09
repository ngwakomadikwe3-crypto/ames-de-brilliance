# Boutique minimal spacing pass

Removed New Arrivals heading and its default product-card section. No replacement announcement. Removed Browse the House label and category footer background/borders. Header, hero dimensions/staging, geometry, interaction, typography, Chat, Video, splash, backend and renderer remain unchanged.

Default flow: header, hero, short editorial, categories. Explore/Collections now scroll to categories instead of the removed section. Existing products remain available only when a category is selected; selecting it again collapses the content. No default product cards or arrival carousel controls are present. Three-screen navigation indicators remain intact.

Spacing: editorial 210px to approximately 136px desktop, 190px to approximately 148px mobile. Category region is 60px desktop / 56px mobile with no footer box. All important default content fits within 1440x900 and 390x844 viewports, without horizontal overflow.

Production build passes. Browser checks verify removal, viewport fit, Explore target and category open/close. Evidence: outputs/boutique-spacing, including full desktop/mobile and combined hero/editorial/categories crops. Local URL: http://127.0.0.1:3099/ then Boutique. No deployment or main merge.
