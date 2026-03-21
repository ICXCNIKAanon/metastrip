'use client';

import dynamic from 'next/dynamic';

interface GpsMapProps {
  lat: number;
  lon: number;
}

// Inner map component — loaded only on the client (Leaflet needs window/document)
const MapInner = dynamic(() => import('./gps-map-inner'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[200px] md:h-[250px] bg-surface text-text-secondary text-sm">
      Loading map…
    </div>
  ),
});

export default function GpsMap({ lat, lon }: GpsMapProps) {
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;

  return (
    <div className="border border-risk-critical/30 rounded-card overflow-hidden">
      <div className="h-[200px] md:h-[250px]">
        <MapInner lat={lat} lon={lon} />
      </div>
      <div className="px-4 py-3 bg-surface flex flex-col gap-1">
        <span className="font-mono text-xs text-text-secondary">
          {lat.toFixed(6)}, {lon.toFixed(6)}
        </span>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-accent hover:underline"
        >
          View on Google Maps →
        </a>
      </div>
    </div>
  );
}
