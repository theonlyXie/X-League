import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which screen the app was on when it died.
 *
 * The error boundary catches a render that throws, and the last-resort handler
 * catches a JavaScript error thrown anywhere else. Neither catches a crash in
 * native code: the process is simply gone, and what the person reports is "it
 * closed". Three reports of that have arrived with nothing to read.
 *
 * So the app writes down where it is, and rubs it out on the way out. Sending
 * the app to the background is a way out; so is putting a screen behind you.
 * Being killed is not — a crash leaves the note behind, and the next launch
 * finds it. A note that is still there is the screen that died.
 *
 * It is deliberately one key holding one short string. This is a trail of
 * breadcrumbs for a bug we cannot otherwise see, not analytics: nothing leaves
 * the phone, nothing is timestamped, and it is cleared the moment it is read.
 */

const KEY = 'x-league.last-screen';

let watching = false;

/** Called on every navigation. Cheap enough to run on each one. */
export function noteScreen(path: string) {
  AsyncStorage.setItem(KEY, path).catch(() => {});

  // Backgrounding the app is an ordinary way to leave it. Anything still
  // written down after that would accuse the wrong screen.
  if (!watching) {
    watching = true;
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') AsyncStorage.removeItem(KEY).catch(() => {});
    });
  }
}

/**
 * Read the note and rub it out, so a crash is reported once and an ordinary
 * launch after it says nothing.
 */
export async function takeCrash(): Promise<string | null> {
  try {
    const path = await AsyncStorage.getItem(KEY);
    if (path) await AsyncStorage.removeItem(KEY);
    return path;
  } catch {
    return null;
  }
}
