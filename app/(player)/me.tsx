import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Eyebrow } from '@/components/ui';
import { ChevronRight, TrendUp } from '@/components/icons';
import { StrokeLine } from '@/components/StrokeLine';
import { cssAngle } from '@/theme/gradient';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { CARD } from '@/data/player';
import { useSession } from '@/state/session';
import { isLive } from '@/lib/supabase';

/**
 * P-08 Profile / P-09 Card detail — the persistent football identity (§4.3).
 *
 * §5.1: this is original geometry. It is deliberately not a game publisher's
 * card frame, and every score exposes its confidence and evidence count.
 */
export default function Me() {
  const router = useRouter();
  const { signedIn, displayName, venues, signOut } = useSession();
  const explained = CARD.attributes.find((a) => a.key === CARD.explained)!;
  const evidencePct = 100 - CARD.selfAssessedPct;

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20, alignItems: 'center' }}>
      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
          Your card
        </Txt>
        <Txt size={11.5} color={onVoid.dim}>
          Season 1
        </Txt>
      </View>

      <VoidCard />

      <View style={{ width: '100%', flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
        <StatTile label="FORM" value={`${CARD.form}`} gold icon />
        <StatTile label="VERIFIED" value={`${CARD.verifiedMatches} matches`} />
        <StatTile label="RATERS" value={`${CARD.raters}`} />
      </View>

      {/* §5.1: every displayed score exposes where it came from. */}
      <View
        style={{
          width: '100%',
          padding: 16,
          borderRadius: radius.control,
          backgroundColor: void_.surface,
          borderWidth: 1,
          borderColor: onVoid.edge,
          gap: 10,
        }}
      >
        <Eyebrow>
          Where {explained.value} {CARD.explained} comes from
        </Eyebrow>
        <EvidenceBar label="Match evidence" pct={evidencePct} color={gold.base} />
        <EvidenceBar label="Self-assessment" pct={CARD.selfAssessedPct} color="rgba(198,163,75,.45)" />
        <Txt size={11.5} lh={1.55} color={onVoid.dim}>
          Individual raters stay anonymous. No single match can move an attribute more than ±2.
        </Txt>
      </View>

      {/* RBAC-005 / §3.1: hold more than one role, switch without signing out.
          Which venues appear is the server's answer (`my_venues`), not a guess
          the client makes — RBAC-002 scoping is enforced on every call anyway. */}
      <View style={{ width: '100%', gap: 12 }}>
        <Eyebrow>{signedIn || !isLive ? 'Workspace' : 'Account'}</Eyebrow>
        <View style={{ gap: 8 }}>
          {isLive && !signedIn ? (
            <WorkspaceRow
              title="Sign in"
              detail="Verify your number to book and to reach owner mode"
              onPress={() => router.push('/sign-in?next=/me')}
            />
          ) : null}

          {(isLive ? venues : [{ venueId: 'demo', name: 'Stadium One', role: 'manager' as const }]).map((v) => (
            <WorkspaceRow
              key={v.venueId}
              title="Owner mode"
              detail={`${v.name} · calendar, arrivals and CRM`}
              onPress={() => router.push('/owner')}
            />
          ))}

          <WorkspaceRow
            title="Admin console"
            detail="Platform operations · audited"
            onPress={() => router.push('/admin')}
          />

          {signedIn ? (
            <WorkspaceRow
              title="Sign out"
              detail={displayName ? `Signed in as ${displayName}` : 'End this session'}
              onPress={() => void signOut()}
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

/** The Void card itself — X-to-void geometry behind the numbers. */
function VoidCard() {
  return (
    <LinearGradient
      colors={[void_.cardTop, void_.bg]}
      locations={[0, 0.55]}
      {...cssAngle(165)}
      style={{
        width: 262,
        height: 372,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: goldAlpha.frame,
        overflow: 'hidden',
        padding: 20,
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
        <View
          style={{
            position: 'absolute',
            top: 88,
            left: '50%',
            marginLeft: -90,
            width: 180,
            height: 180,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: goldAlpha.ring,
          }}
        />
        <View
          style={{
            position: 'absolute',
            top: 118,
            left: '50%',
            marginLeft: -60,
            width: 120,
            height: 120,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: goldAlpha.ringInner,
          }}
        />
        {[38, -38].map((deg) => (
          <StrokeLine key={deg} length={300} angle={deg} top={178} left={-20} color={goldAlpha.stroke} />
        ))}
        <View
          style={{
            position: 'absolute',
            top: 160,
            left: '50%',
            marginLeft: -18,
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: void_.disc,
            borderWidth: 1,
            borderColor: goldAlpha.discEdge,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          <Txt size={52} weight="extrabold" em={-0.04} lh={0.9} color={gold.base}>
            {CARD.ovr}
          </Txt>
          <Txt size={12} weight="bold" em={0.16} color="rgba(243,238,229,.7)" style={{ marginTop: 4 }}>
            {CARD.position}
          </Txt>
        </View>
        <View
          style={{
            borderWidth: 1,
            borderColor: 'rgba(198,163,75,.45)',
            borderRadius: radius.badge,
            paddingVertical: 3,
            paddingHorizontal: 6,
          }}
        >
          <Txt size={9.5} weight="bold" em={0.12} color={gold.base}>
            {CARD.confidence}
          </Txt>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', gap: 3 }}>
        <Txt size={21} weight="bold" em={0.02} color={onVoid.primary}>
          {CARD.name}
        </Txt>
        <Txt size={9.5} weight="semibold" em={0.2} color="rgba(198,163,75,.85)">
          VOID CARD · LVL {CARD.level}
        </Txt>
      </View>

      {/* Two columns, three rows — the design's 1fr 1fr grid. */}
      <View style={{ marginTop: 18, gap: 9 }}>
        {[0, 2, 4].map((start) => (
          <View key={start} style={{ flexDirection: 'row', gap: 22 }}>
            {CARD.attributes.slice(start, start + 2).map((attr) => (
              <View key={attr.key} style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={11} em={0.1} color={onVoid.muted}>
                  {attr.key}
                </Txt>
                <Txt size={13} weight="bold" color={attr.key === CARD.explained ? gold.base : onVoid.primary}>
                  {attr.value}
                </Txt>
              </View>
            ))}
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}

function StatTile({ label, value, gold: isGold, icon }: { label: string; value: string; gold?: boolean; icon?: boolean }) {
  return (
    <View
      style={{
        flex: 1,
        padding: 13,
        borderRadius: radius.row,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: onVoid.edge,
        gap: 4,
      }}
    >
      <Txt size={10} em={0.14} color="rgba(243,238,229,.38)">
        {label}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon ? <TrendUp size={11} color={gold.base} /> : null}
        <Txt size={15} weight="bold" color={isGold ? gold.base : onVoid.primary}>
          {value}
        </Txt>
      </View>
    </View>
  );
}

function EvidenceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          flex: 1,
          height: 3,
          backgroundColor: 'rgba(243,238,229,.1)',
          borderRadius: radius.pill,
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
      </View>
      <Txt size={11} color={onVoid.muted} style={{ width: 92 }}>
        {label}
      </Txt>
    </View>
  );
}

function WorkspaceRow({ title, detail, onPress }: { title: string; detail: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Txt size={14.5} weight="semibold" color={onVoid.primary}>
          {title}
        </Txt>
        <Txt size={11.5} color={onVoid.faint}>
          {detail}
        </Txt>
      </View>
      <ChevronRight size={16} color={onVoid.dim} />
    </Pressable>
  );
}
