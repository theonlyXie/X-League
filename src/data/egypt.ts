import type { TextKey } from '@/i18n/strings';

/**
 * The twenty-seven governorates of Egypt.
 *
 * A code, not a name, is what gets stored: a player who signs up in English and
 * a venue registered in Arabic have to land in the same bucket, and free text
 * never does — the venues in this database already carry `Nasr City`, `Maadi`,
 * `awsim` and `Awsim` as four different places.
 *
 * The governorate is the coarse filter. The area a venue types in stays as it
 * is, because "Nasr City" is what somebody actually says when asked where they
 * play, and it is more use than "Cairo" once you are already in Cairo.
 *
 * Ordered by population rather than alphabetically in either language: sorting
 * by name puts a different governorate first depending on which language you
 * opened the app in, and the list is long enough that the order matters.
 */
export type Governorate = {
  code: string;
  label: TextKey;
};

export const GOVERNORATES: Governorate[] = [
  { code: 'cairo', label: 'govCairo' },
  { code: 'giza', label: 'govGiza' },
  { code: 'alexandria', label: 'govAlexandria' },
  { code: 'qalyubia', label: 'govQalyubia' },
  { code: 'sharqia', label: 'govSharqia' },
  { code: 'dakahlia', label: 'govDakahlia' },
  { code: 'beheira', label: 'govBeheira' },
  { code: 'minya', label: 'govMinya' },
  { code: 'sohag', label: 'govSohag' },
  { code: 'asyut', label: 'govAsyut' },
  { code: 'monufia', label: 'govMonufia' },
  { code: 'gharbia', label: 'govGharbia' },
  { code: 'beni_suef', label: 'govBeniSuef' },
  { code: 'faiyum', label: 'govFaiyum' },
  { code: 'kafr_el_sheikh', label: 'govKafrElSheikh' },
  { code: 'qena', label: 'govQena' },
  { code: 'aswan', label: 'govAswan' },
  { code: 'damietta', label: 'govDamietta' },
  { code: 'ismailia', label: 'govIsmailia' },
  { code: 'luxor', label: 'govLuxor' },
  { code: 'port_said', label: 'govPortSaid' },
  { code: 'suez', label: 'govSuez' },
  { code: 'matrouh', label: 'govMatrouh' },
  { code: 'north_sinai', label: 'govNorthSinai' },
  { code: 'south_sinai', label: 'govSouthSinai' },
  { code: 'red_sea', label: 'govRedSea' },
  { code: 'new_valley', label: 'govNewValley' },
];

export const isGovernorate = (code: string | null | undefined): boolean =>
  !!code && GOVERNORATES.some((g) => g.code === code);
