import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { noteError } from '@/lib/breadcrumb';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';

/**
 * What happens instead of the app closing.
 *
 * A render that throws in React Native takes the whole app down: the screen
 * goes, the process goes, and what reaches us is "it crashes" — no message, no
 * screen name, nothing to work from. That is how the club screen has been
 * reported twice, and both times there was nothing to read.
 *
 * This catches it and shows what was thrown. It is written in English on
 * purpose: the text here is meant to be screenshotted and sent to whoever is
 * fixing it, and a translated stack trace helps nobody. The person still has a
 * way out that does not involve force-quitting.
 *
 * A class component because there is no hook for this; `componentDidCatch` is
 * the only way React offers to catch a render error.
 */
type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null; info: string | null };

export class Boundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ info: info?.componentStack ?? null });
    // Written down as well as shown. The screen below is only any use if this
    // component can itself render — and a failure deep enough to stop that is
    // exactly the one worth having a record of on the next launch.
    noteError(`${error?.message ?? String(error)}\n\n${(info?.componentStack ?? '').trim()}`);
    if (__DEV__) console.error('[boundary]', error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: void_.bg, padding: 20, paddingTop: 64, gap: 16 }}>
        <Txt size={20} weight="bold" color={onVoid.primary}>
          This screen hit an error
        </Txt>
        <Txt size={13} lh={1.6} color={onVoid.secondary}>
          Nothing is lost. Screenshot this and send it on — the message below is
          what the fix needs.
        </Txt>

        <ScrollView
          style={{
            maxHeight: 300,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: 'rgba(101,21,37,.5)',
            backgroundColor: 'rgba(101,21,37,.09)',
          }}
          contentContainerStyle={{ padding: 14, gap: 10 }}
        >
          <Txt size={12.5} lh={1.5} color={burgundy.action}>
            {String(error?.message ?? error)}
          </Txt>
          {info ? (
            <Txt size={11} lh={1.45} color={onVoid.muted}>
              {info.trim().split('\n').slice(0, 12).join('\n')}
            </Txt>
          ) : null}
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => {
            this.setState({ error: null, info: null });
            this.props.onReset?.();
          }}
          style={{
            height: 48,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: goldAlpha.frame,
            backgroundColor: goldAlpha.fill,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt size={14} weight="semibold" color={gold.base}>
            Try again
          </Txt>
        </Pressable>
      </View>
    );
  }
}
