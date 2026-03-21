'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

interface GpsMapInnerProps {
  lat: number;
  lon: number;
}

// Custom red-circle SVG icon — avoids Leaflet's broken default asset paths in Next.js
const redIcon = L.icon({
  iconUrl:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
        '<circle cx="12" cy="12" r="10" fill="#ef4444" stroke="#fff" stroke-width="2"/>' +
        '<circle cx="12" cy="12" r="4" fill="#fff"/>' +
      '</svg>',
    ),
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

export default function GpsMapInner({ lat, lon }: GpsMapInnerProps) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={13}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
      />
      <Marker position={[lat, lon]} icon={redIcon} />
    </MapContainer>
  );
}
