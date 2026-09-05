import { Alert } from 'react-native';
import { noteError } from '@/lib/breadcrumb';

/**
 * What happens when something throws where React cannot see it.
 *
 * The boundary at the root of the app catches a render that throws. It cannot
 * catch anything else: an error inside a press handler, a rejected promise
 * nobody awaited, a callback from a native module. In a release build the
 * default handler for those closes the app — no screen, no message, nothing to
 * send on. That is what "it crashes" looks like from the outside, and it is
 * indistinguishable from a native crash, which is the thing that makes it so
 * hard to fix from a description.
 *
 * This replaces that handler, and the order it does things in is the whole
 * point. The first version alerted and then called the previous handler on the
 * next line. `Alert.alert` does not draw anything — it posts a message to the
 * native UI thread and returns — and the default fatal handler kills the
 * process before that thread gets a turn. So the alert was never seen once,
 * and every fatal error in JavaScript arrived looking exactly like a crash in
 * native code. Three reports of "it just closes" were read that way.
 *
 * Now the message is written down first, so it survives even a death that
 * beats the alert, and the app is not killed until somebody has pressed OK on
 * it. An app with a fatal error cannot carry on, but it can say what happened
 * before it goes.
 *
 * English on purpose, for the same reason the boundary is: this text exists to
 * be sent to whoever is fixing it, beside a stack trace that is English anyway.
 */
type Handler = (error: unknown, isFatal?: boolean) => void;

type WithErrorUtils = {
  ErrorUtils?: {
    getGlobalHandler?: () => Handler;
    setGlobalHandler?: (handler: Handler) => void;
  };
};

export function installLastResortHandler() {
  const scope = globalThis as unknown as WithErrorUtils;
  const utils = scope.ErrorUtils;
  if (!utils?.setGlobalHandler) return;

  const previous = utils.getGlobalHandler?.();

  utils.setGlobalHandler((error, isFatal) => {
    const message =
      error instanceof Error
        ? `${error.message}\n\n${(error.stack ?? '').split('\n').slice(0, 8).join('\n')}`
        : String(error);

    // Written before anything else. If the process dies anyway — a second
    // error while this one is being reported, or a native crash underneath it
    // — the next launch still finds the sentence.
    noteError(message);

    // Alert rather than a screen: by the time this fires the React tree may
    // already be unmountable, and an alert is drawn by the platform.
    Alert.alert(
      isFatal ? 'X League has to close' : 'Something went wrong',
      `Screenshot this and send it on.\n\n${message}`,
      [{ text: 'OK', onPress: () => previous?.(error, isFatal) }],
      { cancelable: false },
    );
  });
}
