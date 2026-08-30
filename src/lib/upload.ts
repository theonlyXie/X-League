import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

/**
 * Pick an image and put it in Storage.
 *
 * The bytes go up as a decoded `Uint8Array` rather than a `Blob`. React
 * Native's Blob is a handle to native memory with no readable body, so
 * supabase-js uploads it as an empty file — a bug that looks like a successful
 * upload and an image that never appears. Base64 out of the picker, decoded
 * here, is the shape that survives both runtimes.
 *
 * The path is always `<owner id>/<file>`, because the Storage policies key on
 * the first path segment: your own id for a photo, a club you captain for a
 * crest. A path built any other way is refused by the server rather than
 * quietly written somewhere it should not be.
 */

const MAX_BYTES = 3 * 1024 * 1024;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array((clean.length * 3) >> 2);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c >= 0) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) bytes[p++] = ((c & 3) << 6) | d;
  }
  return p === bytes.length ? bytes : bytes.subarray(0, p);
}

export type PickResult =
  | { status: 'ok'; url: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'too-large' }
  | { status: 'failed' };

export async function pickAndUpload(bucket: 'avatars' | 'crests', ownerId: string): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
  });
  if (picked.canceled || !picked.assets?.length) return { status: 'cancelled' };

  const asset = picked.assets[0];
  if (!asset.base64) return { status: 'failed' };

  const bytes = decodeBase64(asset.base64);
  if (bytes.byteLength > MAX_BYTES) return { status: 'too-large' };

  const type = asset.mimeType ?? 'image/jpeg';
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  // A fresh name each time, so a CDN holding the old one does not show it.
  const path = `${ownerId}/${Date.now()}.${extension}`;

  const storage = supabase().storage.from(bucket);
  const { error } = await storage.upload(path, bytes, { contentType: type, upsert: true });
  if (error) return { status: 'failed' };

  const { data } = storage.getPublicUrl(path);
  if (!data?.publicUrl) return { status: 'failed' };
  return { status: 'ok', url: data.publicUrl };
}

export async function setMyPhoto(url: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase().rpc('set_my_photo', { p_url: url });
  if (error) throw error;
  const r = (data as any[])[0];
  return { ok: !!r?.ok, reason: r?.reason ?? undefined };
}
