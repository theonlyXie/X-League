import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { Button, Eyebrow } from '@/components/ui';
import { ChevronRight, TrendUp } from '@/components/icons';
import { StrokeLine } from '@/components/StrokeLine';
import { VoidMark } from '@/components/VoidMark';
import { cssAngle } from '@/theme/gradient';
import { gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { CARD } from '@/data/player';
import { useCard } from '@/state/card';
import type { MatchEvidence } from '@/data/progress';
import { CONFIDENCE_COPY } from '@/data/assessment';
import { useI18n } from '@/i18n';
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
  const { signedIn, displayName, venues, platformRole, signOut } = useSession();
  const { card, evidence, matches, awaitingResult, loading, isFixture } = useCard();
  const { t, num, locale, setLocale, needsRestart, rtl } = useI18n();

  // Three states, not two, and conflating them was the worst bug in the app.
  //
  // `isFixture` is a demo build or a signed-out visitor: there is no account,
  // so the design's showcase card stands in for one and nobody is being told
  // anything about themselves. A signed-in player who has not built a card yet
  // is a different thing entirely — and showing them the fixture's 18 verified
  // matches and 41 raters is exactly what §5.1 exists to prevent. It was doing
  // that, because the only test was `card !== null`.
  const showcase = isFixture;
  const live = card !== null;
  // Nothing to show yet: an account, no card. Tiles and provenance are hidden
  // rather than filled with zeros, because a panel headed "where 84 PAS comes
  // from" has nothing to say about an attribute that does not exist.
  const blank = !showcase && !live;
  const name = live ? card.displayName || displayName || CARD.name : CARD.name;
  const ovr = live ? card.ovr : CARD.ovr;
  const positionCode = live ? card.position : CARD.position;
  const confidence = live ? card.confidence : 'established';
  const attributes = live ? card.attributes : CARD.attributes.map((a) => ({ key: a.key, value: a.value }));
  const selfPct = live ? Math.round(card.selfWeight * 100) : CARD.selfAssessedPct;
  const evidenceCount = live ? card.evidenceCount : CARD.verifiedMatches;
  const evidencePct = 100 - selfPct;
  // The attribute whose provenance the card explains: the strongest one.
  const explained = attributes.reduce((best, a) => (a.value > best.value ? a : best), attributes[0]);

  return (
    <Screen contentStyle={{ paddingTop: 6, paddingHorizontal: 20, paddingBottom: 28, gap: 20, alignItems: 'center' }}>
      <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt size={20} weight="bold" em={-0.02} color={onVoid.primary}>
          {t.yourCard}
        </Txt>
        <Txt size={11.5} color={onVoid.dim}>
          {t.season(num(1))}
        </Txt>
      </View>

      {blank && !loading ? (
        <NoCardYet onStart={() => router.push('/onboarding')} />
      ) : (
        <VoidCard
          name={name}
          ovr={ovr}
          positionCode={positionCode}
          confidence={confidence}
          attributes={attributes}
          explained={explained.key}
          level={CARD.level}
        />
      )}

      {/* Hidden entirely while there is no card, because these tiles have no
          honest value to show — `—`, 0 and 0 is noise, and the fixture's
          numbers are somebody else's. `-` in the form strip still means a real
          card whose matches were never scored, which the strip must be able
          to say. */}
      {blank ? null : (
        <View style={{ width: '100%', flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
          <StatTile
            label={t.form}
            value={live ? (evidence?.form.length ? evidence.form.join(' ') : '—') : `${CARD.form}`}
            gold={!live}
            icon={!live}
          />
          <StatTile label={t.verifiedMatches} value={t.matches(num(evidenceCount))} />
          <StatTile label={t.raters} value={num(live ? (evidence?.raterCount ?? 0) : CARD.raters)} />
        </View>
      )}

      {/* Matches that were played and never reported. They are not evidence
          and cannot become evidence until somebody says how they ended, so
          they sit above the evidence list rather than inside it. */}
      {live && awaitingResult.length > 0 ? (
        <View style={{ width: '100%', gap: 8 }}>
          <Eyebrow>{t.resultAwaiting}</Eyebrow>
          {awaitingResult.map((b) => (
            <Pressable
              key={b.bookingId}
              accessibilityRole="button"
              accessibilityLabel={`${t.resultGoTo} — ${b.venueName}`}
              onPress={() => router.push(`/play/result?booking=${b.bookingId}`)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 13,
                paddingHorizontal: 14,
                borderRadius: radius.control,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: goldAlpha.edgeSoft,
              }}
            >
              <View style={{ gap: 2, flex: 1 }}>
                <Txt size={13} weight="semibold" color={onVoid.primary}>
                  {b.venueName}
                </Txt>
                <Txt size={11} color={onVoid.faint}>
                  {b.pitchLabel}
                </Txt>
              </View>
              <Txt size={12} weight="semibold" color={gold.base}>
                {t.resultGoTo}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* PRO-007: the evidence itself, not just its count. */}
      {live ? <MatchEvidenceList matches={matches} onRate={(id) => router.push(`/play/rate?match=${id}`)} /> : null}

      {/* §5.1: every displayed score exposes where it came from — which means
          there is nothing to render before there is a score. */}
      {blank ? null : (
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
        <Eyebrow>{t.whereFrom(num(explained.value), explained.key)}</Eyebrow>
        <EvidenceBar label={t.matchEvidence} pct={evidencePct} color={gold.base} />
        <EvidenceBar label={t.selfAssessment} pct={selfPct} color="rgba(198,163,75,.45)" />
        <Txt size={11.5} lh={1.55} color={onVoid.dim}>
          {live
            ? CONFIDENCE_COPY[confidence]
            : 'Individual raters stay anonymous. No single match can move an attribute more than ±2.'}
        </Txt>
        {live ? (
          <Txt size={11} color={onVoid.faint}>
            Scoring rule {card.ruleVersion}
          </Txt>
        ) : null}
      </View>
      )}

      {/* RBAC-005 / §3.1: hold more than one role, switch without signing out.
          Which venues appear is the server's answer (`my_venues`), not a guess
          the client makes — RBAC-002 scoping is enforced on every call anyway. */}
      {/* The rooms that are not tabs: a squad's team, and what the product has
          told this player. Both are reachable from here rather than hidden. */}
      {signedIn || !isLive ? (
        <View style={{ width: '100%', gap: 8 }}>
          <RowLink label={t.teamsTitle} onPress={() => router.push('/teams')} />
          <RowLink label={t.notifications} onPress={() => router.push('/notifications')} />
        </View>
      ) : null}

      <View style={{ width: '100%', gap: 12 }}>
        <Eyebrow>{signedIn || !isLive ? t.workspace : t.account}</Eyebrow>
        <View style={{ gap: 8 }}>
          {isLive && !signedIn ? (
            <WorkspaceRow
              title={t.signIn}
              detail="Verify your number to book and to reach owner mode"
              onPress={() => router.push('/sign-in?next=/me')}
            />
          ) : null}

          {(isLive ? venues : [{ venueId: 'demo', name: 'Stadium One', role: 'manager' as const }]).map((v) => (
            <WorkspaceRow
              key={v.venueId}
              title={t.ownerMode}
              detail={`${v.name} · calendar, arrivals and CRM`}
              onPress={() => router.push('/owner')}
            />
          ))}

          {/* RBAC-003: offered only to somebody who actually holds a console
              role. The console refuses everyone else anyway, but a door that
              always says no is worse than no door. */}
          {!isLive || platformRole ? (
            <WorkspaceRow
              title={t.adminConsole}
              detail={
                platformRole
                  ? `Platform operations · ${platformRole} · audited`
                  : 'Platform operations · audited'
              }
              onPress={() => router.push('/admin')}
            />
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: radius.control,
              backgroundColor: void_.surface,
              borderWidth: 1,
              borderColor: onVoid.edgeFaint,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Txt size={14.5} weight="semibold" color={onVoid.primary}>
                {t.language}
              </Txt>
              {needsRestart ? (
                <Txt size={11.5} color={gold.base}>
                  Restart the app to mirror the layout
                </Txt>
              ) : null}
            </View>
            <View
              style={{
                flexDirection: 'row',
                padding: 3,
                borderRadius: radius.pill,
                backgroundColor: void_.bg,
                borderWidth: 1,
                borderColor: onVoid.edge,
              }}
            >
              {(['en', 'ar'] as const).map((code) => {
                const on = code === locale;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={code === 'ar' ? 'العربية' : 'English'}
                    onPress={() => void setLocale(code)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      backgroundColor: on ? 'rgba(198,163,75,.16)' : 'transparent',
                    }}
                  >
                    <Txt size={12} weight={on ? 'bold' : 'semibold'} color={on ? gold.base : onVoid.faint}>
                      {code === 'ar' ? 'العربية' : 'English'}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {signedIn ? (
            <WorkspaceRow
              title={t.signOut}
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
function VoidCard({
  name,
  ovr,
  positionCode,
  confidence,
  attributes,
  explained,
  level,
}: {
  name: string;
  ovr: number;
  positionCode: string;
  confidence: string;
  attributes: { key: string; value: number }[];
  explained: string;
  level: number;
}) {
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
            {ovr}
          </Txt>
          <Txt size={12} weight="bold" em={0.16} color="rgba(243,238,229,.7)" style={{ marginTop: 4 }}>
            {positionCode}
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
            {confidence.toUpperCase()}
          </Txt>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', gap: 3 }}>
        <Txt size={21} weight="bold" em={0.02} color={onVoid.primary}>
          {name.toUpperCase()}
        </Txt>
        <Txt size={9.5} weight="semibold" em={0.2} color="rgba(198,163,75,.85)">
          VOID CARD · LVL {level}
        </Txt>
      </View>

      {/* Two columns, three rows — the design's 1fr 1fr grid. */}
      <View style={{ marginTop: 18, gap: 9 }}>
        {[0, 2, 4].map((start) => (
          <View key={start} style={{ flexDirection: 'row', gap: 22 }}>
            {attributes.slice(start, start + 2).map((attr) => (
              <View key={attr.key} style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={11} em={0.1} color={onVoid.muted}>
                  {attr.key}
                </Txt>
                <Txt size={13} weight="bold" color={attr.key === explained ? gold.base : onVoid.primary}>
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

/**
 * P-09's "Match evidence". Each row says how many independent people have
 * rated in that match, because three is the threshold at which it counts —
 * a player watching that number climb is watching their card become real.
 */
function MatchEvidenceList({
  matches,
  onRate,
}: {
  matches: MatchEvidence[];
  onRate: (matchId: string) => void;
}) {
  const { t, num, shortDate } = useI18n();

  return (
    <View style={{ width: '100%', gap: 12 }}>
      <Eyebrow>{t.matchEvidence}</Eyebrow>
      {matches.length === 0 ? (
        <View style={{ gap: 4 }}>
          <Txt size={13} color={onVoid.muted}>
            {t.matchEvidenceEmpty}
          </Txt>
          <Txt size={11.5} color={onVoid.dim}>
            {t.matchEvidenceBlurb}
          </Txt>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {matches.map((m) => (
            <Pressable
              key={m.matchId}
              accessibilityRole="button"
              accessibilityLabel={`${m.venueName}, ${m.raters} raters`}
              disabled={!m.canRate}
              onPress={() => onRate(m.matchId)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderRadius: radius.control,
                backgroundColor: void_.surface,
                borderWidth: 1,
                borderColor: m.state === 'verified' ? goldAlpha.edgeSoft : onVoid.edgeFaint,
              }}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <Txt size={13.5} weight="semibold" color={onVoid.primary}>
                  {m.venueName}
                </Txt>
                <Txt size={11} color={onVoid.faint}>
                  {shortDate(m.playedAt)}
                  {m.scoreHome != null && m.scoreAway != null
                    ? ` · ${num(m.scoreHome)}–${num(m.scoreAway)}`
                    : ''}
                </Txt>
              </View>
              <Txt
                size={11}
                weight="semibold"
                color={m.state === 'verified' ? gold.base : onVoid.dim}
              >
                {m.state === 'verified' ? t.verified3 : t.awaitingRaters(num(m.raters))}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** A plain destination row, in the design's list idiom. */
function RowLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: pressed ? goldAlpha.edge : onVoid.edgeFaint,
      })}
    >
      <Txt size={14} weight="semibold" color={onVoid.primary}>
        {label}
      </Txt>
      <ChevronRight size={14} color={onVoid.dim} />
    </Pressable>
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

/**
 * A signed-in player who has not done the assessment yet has no card. Showing
 * the design's fixture here would be showing them somebody else's rating.
 */
function NoCardYet({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  return (
    <View
      style={{
        width: 262,
        height: 372,
        borderRadius: radius.card,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: goldAlpha.accent,
        backgroundColor: void_.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 26,
        gap: 18,
      }}
    >
      <VoidMark size={96} rings={2} />
      <View style={{ gap: 8, alignItems: 'center' }}>
        <Txt size={17} weight="bold" align="center" color={onVoid.primary}>
          {t.noCardYet}
        </Txt>
        <Txt size={12.5} lh={1.5} align="center" color={onVoid.faint}>
          {t.noCardBlurb}
        </Txt>
      </View>
      <Button label={t.buildMyCard} height={44} round={radius.row} size={14} onPress={onStart} />
    </View>
  );
}
