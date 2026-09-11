import type { TextKey } from '@/i18n/strings';

/**
 * The amenities a five-a-side pitch actually advertises, in both languages.
 *
 * A venue types its facilities as free text — "Floodlights, Parking" — and the
 * pitch page drew those words exactly as typed. In an Arabic-first app that
 * meant an Arabic reader was shown `5-a-side`, `Artificial turf`, `Floodlit`,
 * `Parking` and `Showers`, which is most of what that screen says about a
 * ground before somebody decides to book it.
 *
 * So the free text is *recognised* rather than replaced. A venue keeps typing
 * whatever it likes and nothing it has already entered is lost; what is
 * recognised gets the right word in the reader's language, and what is not is
 * shown as typed. That is the honest halfway house: this cannot invent an
 * Arabic name for a facility nobody anticipated, and dropping the unrecognised
 * ones would hide real information about a real pitch.
 *
 * Both spellings map to the same entry, because the same venue is described in
 * Arabic by one owner and in English by the next — the same reason the
 * governorate is stored as a code rather than as whatever somebody typed.
 */

/** Lower case, no punctuation, no doubled spaces — `Floodlit!` and `floodlit`. */
const key = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** Every spelling that means one thing, and the string-table key for it. */
const VOCABULARY: { label: TextKey; spellings: string[] }[] = [
  { label: 'amFiveASide', spellings: ['5 a side', '5aside', 'five a side', 'خماسي', 'خماسى'] },
  { label: 'amSevenASide', spellings: ['7 a side', '7aside', 'seven a side', 'سباعي', 'سباعى'] },
  { label: 'amElevenASide', spellings: ['11 a side', '11aside', 'eleven a side', 'احداشي', 'إحدى عشر'] },
  {
    label: 'amArtificialTurf',
    spellings: ['artificial turf', 'artificial grass', 'astroturf', 'astro turf', 'turf', 'نجيل صناعي', 'نجيلة صناعية'],
  },
  { label: 'amNaturalGrass', spellings: ['natural grass', 'real grass', 'grass', 'نجيل طبيعي', 'نجيلة طبيعية'] },
  {
    label: 'amFloodlit',
    spellings: ['floodlit', 'floodlights', 'flood lights', 'lights', 'lighting', 'كشافات', 'إضاءة', 'اضاءة'],
  },
  { label: 'amParking', spellings: ['parking', 'car park', 'موقف', 'موقف سيارات', 'جراج'] },
  { label: 'amShowers', spellings: ['showers', 'shower', 'دش', 'دشات', 'حمامات'] },
  {
    label: 'amChangingRooms',
    spellings: ['changing rooms', 'changing room', 'dressing rooms', 'lockers', 'غرف تغيير', 'غرفة تغيير'],
  },
  { label: 'amCafe', spellings: ['cafe', 'café', 'cafeteria', 'kiosk', 'كافيه', 'كافيتيريا', 'كشك'] },
  { label: 'amCovered', spellings: ['covered', 'indoor', 'roofed', 'مغطى', 'مسقوف', 'مغلق'] },
  { label: 'amSeating', spellings: ['seating', 'seats', 'stands', 'spectator seating', 'مدرجات', 'كراسي'] },
  { label: 'amWater', spellings: ['water', 'drinking water', 'مياه', 'مية', 'مياه شرب'] },
  { label: 'amFirstAid', spellings: ['first aid', 'medic', 'إسعافات أولية', 'اسعافات'] },
  { label: 'amWifi', spellings: ['wifi', 'wi fi', 'internet', 'واي فاي', 'انترنت'] },
  { label: 'amBalls', spellings: ['balls', 'ball provided', 'balls provided', 'كرات', 'كورة'] },
  { label: 'amBibs', spellings: ['bibs', 'vests', 'فانلات', 'تيشرتات'] },
  { label: 'amReferee', spellings: ['referee', 'ref', 'referee available', 'حكم', 'حكام'] },
  { label: 'amMosque', spellings: ['prayer room', 'mosque', 'musalla', 'مصلى', 'مسجد'] },
];

const BY_SPELLING = new Map<string, TextKey>();
for (const entry of VOCABULARY) {
  for (const spelling of entry.spellings) BY_SPELLING.set(key(spelling), entry.label);
}

/**
 * The string-table key for a venue's amenity, or null when it is not one this
 * knows — in which case the caller shows what the venue typed.
 */
export const amenityKey = (raw: string): TextKey | null =>
  BY_SPELLING.get(key(raw ?? '')) ?? null;
