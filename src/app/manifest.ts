import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'AMES', short_name: 'AMES', description: 'AMES jewelry intelligence and concierge', start_url: '/app', display: 'standalone', background_color: '#0b0d10', theme_color: '#0b0d10', icons: [{src:'/icon.png',sizes:'192x192',type:'image/png'},{src:'/icon.png',sizes:'512x512',type:'image/png'}] };
}
