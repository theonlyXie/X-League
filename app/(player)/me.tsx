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
import { PROGRESSION } from '@/data/player';
import { useProfile } from '@/state/profile';
import { useMyVenueSubmission } from '@/state/venues';

/**
 * P-08 Profile / P-09 Card detail — the persistent football identity (§4.3).
 *
 * §5.1: this is original geometry. It is deliberately not a game publisher's
 * card frame, and every score exposes its confidence and evidence count.
 */
export default function Me() {
  const router = useRouter();
  const { card } = useProfile();
  const { mine } = useMyVenueSubmission();
  const explained = card.attributes.find((a) => a.key === card.explained)!;
  const evidencePct = 100 - card.selfAssessedPct;

  const ownerDetail =
    mine?.status === 'approved'
      ? `${mine.name} · calendar, arrivals and CRM`
      : mine?.status === 'pending'
        ? `${mine.name} · awaiting admin approval`
        : mine?.status === 'rejected'
          ? 'Listing not approved · submit again'
          : 'Stadium One demo · or register your venue';

  const openOwner = () => {
    if (mine?.status === 'pending' || mine?.status === 'rejected') router.push('/owner/pending');
    else router.push('/owner');
  };

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

      <VoidCard card={card} />

      <View style={{ width: '100%', flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
        <StatTile label="FORM" value={`${3}`} gold icon />
        <StatTile label="VERIFIED" value={`${card.confidence === 'ESTABLISHED' ? 18 : 0} matches`} />
        <StatTile label="RATERS" value={`${card.confidence === 'ESTABLISHED' ? 41 : 0}`} />
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
          Where {explained.value} {card.explained} comes from
        </Eyebrow>
        <EvidenceBar label="Match evidence" pct={evidencePct} color={gold.base} />
        <EvidenceBar label="Self-assessment" pct={card.selfAssessedPct} color="rgba(198,163,75,.45)" />
        <Txt size={11.5} lh={1.55} color={onVoid.dim}>
          Individual raters stay anonymous. No single match can move an attribute more than ±2.
        </Txt>
      </View>

      {/* RBAC-005 / §3.1: hold more than one role, switch without signing out. */}
      <View style={{ width: '100%', gap: 12 }}>
        <Eyebrow>Workspace</Eyebrow>
        <View style={{ gap: 8 }}>
          <WorkspaceRow
            title="My bookings"
            detail="Active holds, confirmations and history"
            onPress={() => router.push('/bookings')}
          />
          <WorkspaceRow
            title="Register your venue"
            detail="Submit a listing and wait for admin approval"
            onPress={() => router.push('/owner/register')}
          />
          <WorkspaceRow title="Owner mode" detail={ownerDetail} onPress={openOwner} />
          <WorkspaceRow
            title="Admin console"
            detail="Platform operations · audited"
            onPress={() => router.push('/admin')}
          />
        </View>
      </View>
    </Screen>
  );
}

/** The Void card itself — X-to-void geometry behind the numbers. */
function VoidCard({ card }: { card: ReturnType<typeof useProfile>['card'] }) {
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
            {card.ovr}
          </Txt>
          <Txt size={12} weight="bold" em={0.16} color="rgba(243,238,229,.7)" style={{ marginTop: 4 }}>
            {card.position}
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
            {card.confidence}
          </Txt>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', gap: 3 }}>
        <Txt size={21} weight="bold" em={0.02} color={onVoid.primary}>
          {card.name}
        </Txt>
        <Txt size={9.5} weight="semibold" em={0.2} color="rgba(198,163,75,.85)">
          VOID CARD · LVL {PROGRESSION.level}
        </Txt>
      </View>

      {/* Two columns, three rows — the design's 1fr 1fr grid. */}
      <View style={{ marginTop: 18, gap: 9 }}>
        {[0, 2, 4].map((start) => (
          <View key={start} style={{ flexDirection: 'row', gap: 22 }}>
            {card.attributes.slice(start, start + 2).map((attr) => (
              <View key={attr.key} style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={11} em={0.1} color={onVoid.muted}>
                  {attr.key}
                </Txt>
                <Txt size={13} weight="bold" color={attr.key === card.explained ? gold.base : onVoid.primary}>
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
