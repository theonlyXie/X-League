import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Which screen the app was on when it died, and what it said on the way out.
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
 * The second note is the error itself. It exists because the first one, on its
 * own, could not tell a fatal JavaScript error from a native one: both close
 * the app with nothing on screen. A route alone says where to look; the message
 * says what to look at.
 *
 * The two notes are kept apart on purpose. The route is cleared whenever the
 * app is backgrounded, because leaving is ordinary. The message is not: it is
 * cleared only once it has been read, so an error thrown as the app goes away
 * is still there to be shown when it comes back.
 *
 * It is deliberately two keys holding two short strings. This is a trail of
 * breadcrumbs for a bug we cannot otherwise see, not analytics: nothing leaves
 * the phone, nothing is timestamped, and both are cleared the moment they are
 * read.
 */

const SCREEN = 'x-league.last-screen';
const ERROR = 'x-league.last-error';

/** How much of a stack trace fits in an alert somebody will photograph. */
const LIMIT = 900;

let watching = false;

/** Called on every navigation. Cheap enough to run on each one. */
export function noteScreen(path: string) {
  AsyncStorage.setItem(SCREEN, path).catch(() => {});

  // Backgrounding the app is an ordinary way to leave it. Anything still
  // written down after that would accuse the wrong screen.
  if (!watching) {
    watching = true;
    AppState.addEventListener('change', (state) => {
      if (state !== 'active') AsyncStorage.removeItem(SCREEN).catch(() => {});
    });
  }
}

/**
 * Called from the last-resort handler, before anything that might not return.
 *
 * Deliberately not awaited. The write is dispatched to the native side the
 * moment this is called, which is the most that can be done when the thing to
 * outrun is the process ending.
 */
export function noteError(message: string) {
  AsyncStorage.setItem(ERROR, message.slice(0, LIMIT)).catch(() => {});
}

export type Crash = { path: string | null; error: string | null };

/**
 * Read the notes and rub them out, so a crash is reported once and an ordinary
 * launch after it says nothing.
 */
export async function takeCrash(): Promise<Crash> {
  let path: string | null = null;
  let error: string | null = null;
  try {
    path = await AsyncStorage.getItem(SCREEN);
    if (path) await AsyncStorage.removeItem(SCREEN);
  } catch {
    path = null;
  }
  try {
    error = await AsyncStorage.getItem(ERROR);
    if (error) await AsyncStorage.removeItem(ERROR);
  } catch {
    error = null;
  }
  return { path, error };
}
