export type FlightLatLng = [number, number];

export interface FlightPathGeometry {
  path: FlightLatLng[];
  traveledPath: FlightLatLng[];
  planePosition: FlightLatLng;
  planeBearing: number;
  usesLivePosition: boolean;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress));
}

export function isValidFlightCoordinate(value?: FlightLatLng | null): value is FlightLatLng {
  return Boolean(
    value
    && Number.isFinite(value[0])
    && Number.isFinite(value[1])
    && value[0] >= -90
    && value[0] <= 90
    && value[1] >= -180
    && value[1] <= 180,
  );
}

export function flightDistanceKm(a: FlightLatLng, b: FlightLatLng): number {
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b[1] - a[1]);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function flightBearingDeg(a: FlightLatLng, b: FlightLatLng): number {
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const dLng = toRadians(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function generateGreatCirclePath(
  start: FlightLatLng,
  end: FlightLatLng,
  segments = 50,
): FlightLatLng[] {
  const safeSegments = Math.max(1, Math.round(segments));
  const lat1 = toRadians(start[0]);
  const lng1 = toRadians(start[1]);
  const lat2 = toRadians(end[0]);
  const lng2 = toRadians(end[1]);
  const angularDistance = flightDistanceKm(start, end) / EARTH_RADIUS_KM;

  if (angularDistance < 1e-9) {
    return Array.from({ length: safeSegments + 1 }, () => [...start] as FlightLatLng);
  }

  const sinDistance = Math.sin(angularDistance);
  return Array.from({ length: safeSegments + 1 }, (_, index) => {
    if (index === 0) return [...start] as FlightLatLng;
    if (index === safeSegments) return [...end] as FlightLatLng;
    const t = index / safeSegments;
    const startWeight = Math.sin((1 - t) * angularDistance) / sinDistance;
    const endWeight = Math.sin(t * angularDistance) / sinDistance;
    const x = startWeight * Math.cos(lat1) * Math.cos(lng1)
      + endWeight * Math.cos(lat2) * Math.cos(lng2);
    const y = startWeight * Math.cos(lat1) * Math.sin(lng1)
      + endWeight * Math.cos(lat2) * Math.sin(lng2);
    const z = startWeight * Math.sin(lat1) + endWeight * Math.sin(lat2);
    return [
      toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      toDegrees(Math.atan2(y, x)),
    ];
  });
}

function isPlausibleLivePosition(
  start: FlightLatLng,
  end: FlightLatLng,
  livePosition?: FlightLatLng | null,
): livePosition is FlightLatLng {
  if (!isValidFlightCoordinate(livePosition)) return false;
  const directDistance = flightDistanceKm(start, end);
  if (directDistance < 1) return false;

  const distanceViaLive = flightDistanceKm(start, livePosition) + flightDistanceKm(livePosition, end);
  return distanceViaLive <= directDistance * 1.45 + 150;
}

export function buildFlightPathGeometry({
  start,
  end,
  progress,
  livePosition,
  segments = 50,
}: {
  start: FlightLatLng;
  end: FlightLatLng;
  progress: number;
  livePosition?: FlightLatLng | null;
  segments?: number;
}): FlightPathGeometry {
  const safeSegments = Math.max(4, Math.round(segments));
  const normalizedProgress = clampProgress(progress);
  const usesLivePosition = isPlausibleLivePosition(start, end, livePosition);

  let path: FlightLatLng[];
  let planeIndex: number;

  if (usesLivePosition) {
    const completedSegments = Math.min(
      safeSegments - 2,
      Math.max(2, Math.round((normalizedProgress / 100) * safeSegments)),
    );
    const remainingSegments = safeSegments - completedSegments;
    const completedPath = generateGreatCirclePath(start, livePosition, completedSegments);
    const remainingPath = generateGreatCirclePath(livePosition, end, remainingSegments);
    path = [...completedPath, ...remainingPath.slice(1)];
    planeIndex = completedPath.length - 1;
  } else {
    path = generateGreatCirclePath(start, end, safeSegments);
    planeIndex = Math.min(
      path.length - 1,
      Math.max(0, Math.round((normalizedProgress / 100) * (path.length - 1))),
    );
  }

  const previous = path[Math.max(0, planeIndex - 1)];
  const next = path[Math.min(path.length - 1, planeIndex + 1)];

  return {
    path,
    traveledPath: path.slice(0, Math.max(1, planeIndex + 1)),
    planePosition: path[planeIndex],
    planeBearing: flightBearingDeg(previous, next),
    usesLivePosition,
  };
}
