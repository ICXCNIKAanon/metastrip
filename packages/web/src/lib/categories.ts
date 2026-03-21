// Matches @metastrip/core MetadataCategory union — keep in sync
export type MetadataCategory = 'gps' | 'device' | 'timestamps' | 'software' | 'author' | 'ai' | 'icc' | 'thumbnail' | 'xmp' | 'iptc' | 'other';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

export const TAG_CATEGORIES: Record<string, MetadataCategory> = {
  GPSLatitude: 'gps', GPSLongitude: 'gps', GPSAltitude: 'gps',
  GPSLatitudeRef: 'gps', GPSLongitudeRef: 'gps', GPSAltitudeRef: 'gps',
  GPSTimeStamp: 'gps', GPSDateStamp: 'gps', GPSMapDatum: 'gps',
  GPSSpeed: 'gps', GPSSpeedRef: 'gps', GPSImgDirection: 'gps',
  GPSDestLatitude: 'gps', GPSDestLongitude: 'gps',
  Make: 'device', Model: 'device', LensMake: 'device', LensModel: 'device',
  BodySerialNumber: 'device', LensSerialNumber: 'device',
  CameraSerialNumber: 'device', InternalSerialNumber: 'device',
  ImageUniqueID: 'device', OwnerName: 'device',
  DateTime: 'timestamps', DateTimeOriginal: 'timestamps',
  DateTimeDigitized: 'timestamps', CreateDate: 'timestamps',
  ModifyDate: 'timestamps', SubSecTime: 'timestamps',
  Software: 'software', ProcessingSoftware: 'software',
  HostComputer: 'software', CreatorTool: 'software',
  HistorySoftwareAgent: 'software',
  Artist: 'author', Copyright: 'author', Author: 'author',
  Creator: 'author', Rights: 'author', CopyrightNotice: 'author',
  'By-line': 'author', Credit: 'author',
  Dream: 'ai', 'ai:model': 'ai', 'ai:prompt': 'ai',
  Parameters: 'ai', generation_data: 'ai',
};

export const RISK_LEVELS: Record<MetadataCategory, RiskLevel> = {
  gps: 'critical', device: 'high', timestamps: 'medium', software: 'low',
  author: 'medium', ai: 'low', icc: 'none', thumbnail: 'medium',
  xmp: 'low', iptc: 'low', other: 'low',
};

export function categorizeTag(key: string): MetadataCategory {
  if (TAG_CATEGORIES[key]) return TAG_CATEGORIES[key];
  if (key.startsWith('GPS')) return 'gps';
  if (key.includes('Date') || key.includes('Time')) return 'timestamps';
  if (key.includes('Serial') || key.includes('Device')) return 'device';
  if (key.includes('Software') || key.includes('Tool')) return 'software';
  if (key.includes('Author') || key.includes('Copyright') || key.includes('Creator')) return 'author';
  if (key.includes('ICC') || key.includes('Profile')) return 'icc';
  return 'other';
}

export const CATEGORY_ICONS: Record<MetadataCategory, string> = {
  gps: '📍', device: '📱', timestamps: '🕐', software: '💻',
  author: '👤', ai: '🤖', icc: '🎨', thumbnail: '🖼️',
  xmp: '📋', iptc: '📰', other: '📎',
};
