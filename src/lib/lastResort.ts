import { Alert } from 'react-native';

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
 * This replaces that handler. The app still cannot continue after a fatal
 * error, but it says what happened first, in an alert somebody can screenshot.
 * The previous handler is called afterwards so nothing about crash reporting
 * changes — this only adds a sentence before the lights go out.
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

    // Alert rather than a screen: by the time this fires the React tree may
    // already be unmountable, and an alert is drawn by the platform.
    Alert.alert(
      isFatal ? 'X League has to close' : 'Something went wrong',
      `Screenshot this and send it on.\n\n${message}`,
    );

    previous?.(error, isFatal);
  });
}
