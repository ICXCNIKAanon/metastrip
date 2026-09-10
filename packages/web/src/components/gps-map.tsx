export default function GpsMap({ lat, lon }: { lat: number; lon: number }) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  return (
    <div className="border border-risk-critical/30 rounded-card p-5 bg-risk-critical/5">
      <p className="text-sm font-semibold mb-2">
        Location embedded in this file
      </p>
      <p className="font-mono text-lg break-words">
        {lat.toFixed(6)}, {lon.toFixed(6)}
      </p>
      <p className="text-xs text-text-secondary mt-3">
        Coordinates stay on your device. Opening the link below shares this
        location with Google Maps.
      </p>
      <a
        href={`https://www.google.com/maps?q=${lat},${lon}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mt-3 text-sm text-accent underline"
      >
        Open this location in Google Maps ↗
      </a>
    </div>
  );
}
