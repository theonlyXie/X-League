import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, Linking, Pressable, Switch, View } from 'react-native';
import { TextInput } from '@/components/TextField';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { NotificationBell } from '@/components/NotificationBell';
import { Button, Eyebrow } from '@/components/ui';
import { myAvailability, setAvailability, type Availability } from '@/data/ready';
import { ChevronRight, TrendUp } from '@/components/icons';
import { StrokeLine } from '@/components/StrokeLine';
import { VoidMark } from '@/components/VoidMark';
import { cssAngle } from '@/theme/gradient';
import { burgundy, gold, goldAlpha, onVoid, radius, void_ } from '@/theme/tokens';
import { CARD } from '@/data/player';
import { useCard } from '@/state/card';
import { changePassword } from '@/data/manage';
import type { MatchEvidence } from '@/data/progress';
import { CONFIDENCE_COPY } from '@/data/assessment';
import { useI18n } from '@/i18n';
import { useSession } from '@/state/session';
import { deleteMyAccount } from '@/data/api';
import { isLive } from '@/lib/supabase';
import { PRIVACY_URL, TERMS_URL, legalConfigured } from '@/lib/legal';
import { pickAndUpload, setMyPhoto } from '@/lib/upload';

/**
 * P-08 Profile / P-09 Card detail — the persistent football identity (§4.3).
 *
 * §5.1: this is original geometry. It is deliberately not a game publisher's
 * card frame, and every score exposes its confidence and evidence count.
 */
export default function Me() {
  const router = useRouter();
  const { signedIn, session, displayName, venues, isReferee, signOut } = useSession();
  const { card, evidence, matches, awaitingResult, loading, unreachable, isFixture, reload } = useCard();
  const { reason, t, num, locale, setLocale, needsRestart, rtl } = useI18n();

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
  // And a fourth thing that is none of the three: an account whose card could
  // not be read. Offering "Build my card" there invites a player with forty
  // verified matches to overwrite their self-assessment because of a dropped
  // connection.
  const blank = !showcase && !live && !unreachable;
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Txt size={11.5} color={onVoid.dim}>
            {t.season(num(1))}
          </Txt>
          <NotificationBell />
        </View>
      </View>

      {blank && !loading ? (
        <NoCardYet onStart={() => router.push('/onboarding')} />
      ) : unreachable && !loading ? (
        <CardUnreachable />
      ) : (
        <VoidCard
          name={name}
          photoUrl={live ? card.photoUrl : null}
          ovr={ovr}
          positionCode={positionCode}
          confidence={
            confidence === 'provisional'
              ? t.confProvisional
              : confidence === 'emerging'
                ? t.confEmerging
                : t.confEstablished
          }
          attributes={attributes}
          explained={explained.key}
          level={live ? (evidence?.level ?? 1) : CARD.level}
        />
      )}

      {/* Hidden entirely while there is no card, because these tiles have no
          honest value to show — `—`, 0 and 0 is noise, and the fixture's
          numbers are somebody else's. `-` in the form strip still means a real
          card whose matches were never scored, which the strip must be able
          to say. */}
      {blank || unreachable ? null : (
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
      {/* Not gated on having a card. MCH-001 says a played match with no
          result credits nobody, and a brand-new player's *first* match is
          exactly the case where there is no card yet — so gating the prompt on
          one hid it at the only moment it was the whole point. */}
      {awaitingResult.length > 0 ? (
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
            ? t[CONFIDENCE_COPY[confidence]]
            : t.ratersAnonymous}
        </Txt>
        {live ? (
          <Txt size={11} color={onVoid.faint}>
            {t.scoringRule(card.ruleVersion)}
          </Txt>
        ) : null}
      </View>
      )}

      {/* RBAC-005 / §3.1: hold more than one role, switch without signing out.
          Which venues appear is the server's answer (`my_venues`), not a guess
          the client makes — RBAC-002 scoping is enforced on every call anyway. */}
      {signedIn && live ? (
        <PhotoControl userId={session?.user?.id ?? null} hasPhoto={!!card.photoUrl} onChanged={reload} />
      ) : null}

      {/* Whether this player is open to being asked tonight. It sits above the
          rooms because it is the one control on this screen that changes what
          happens to you rather than where you go.

          On `isLive` and not on `live`: the latter means "has built a card",
          and a player who has not built one is precisely the person this is
          for. Hiding it from them would have made the feature invisible to
          every new account on the day they joined. */}
      {signedIn && isLive ? <ReadyToPlay /> : null}

      {/* The rooms that are not tabs: this player's own bookings, their squad's
          team, and what the product has told them. All reachable from here
          rather than hidden. */}
      {signedIn || !isLive ? (
        <View style={{ width: '100%', gap: 8 }}>
          <RowLink label={t.bookingsTitle} onPress={() => router.push('/bookings')} />
          {/* A permanent row rather than one that appears only when something
              is waiting. A challenge that has already been answered still has
              to be findable, and a row that comes and goes teaches nobody
              where to look. */}
          <RowLink label={t.challenges} onPress={() => router.push('/play/challenges')} />
          <RowLink label={t.clubs} onPress={() => router.push('/clubs')} />
          <RowLink label={t.teamsTitle} onPress={() => router.push('/teams')} />
          <RowLink label={t.leaderboards} onPress={() => router.push('/leaderboard')} />
          <RowLink label={t.notifications} onPress={() => router.push('/notifications')} />
          {/* Only for the few X League has made referees. Nothing here decides
              anything — every referee function checks for itself — but a door
              that will not open should not be shown. */}
          {isReferee ? (
            <RowLink label={t.refereeTitle} onPress={() => router.push('/referee')} />
          ) : null}
        </View>
      ) : null}

      <View style={{ width: '100%', gap: 12 }}>
        <Eyebrow>{signedIn || !isLive ? t.workspace : t.account}</Eyebrow>
        <View style={{ gap: 8 }}>
          {isLive && !signedIn ? (
            <WorkspaceRow
              title={t.signIn}
              detail={t.verifyToBook}
              onPress={() => router.push('/sign-in?next=/me')}
            />
          ) : null}

          {/* A build with no database used to hide the way in and show a
              showcase venue in its place, so it looked like an app whose
              sign-in had simply gone missing. It says so now: the one screen
              somebody checks when they cannot get in is this one. */}
          {!isLive ? (
            <View
              style={{
                padding: 14,
                borderRadius: radius.control,
                borderWidth: 1,
                borderColor: goldAlpha.frame,
                backgroundColor: goldAlpha.fill,
                gap: 5,
              }}
            >
              <Txt size={13.5} weight="semibold" color={gold.base}>
                {t.authNoDatabase}
              </Txt>
              <Txt size={11.5} lh={1.5} color={onVoid.secondary}>
                {t.noDatabaseBlurb}
              </Txt>
            </View>
          ) : null}

          {/* Somebody who joined as a player and turns out to have a pitch.
              Offered only when they staff nothing, because an owner already
              has Owner Mode above and a second door to the same place would
              read as a second venue. */}
          {isLive && signedIn && venues.length === 0 ? (
            <WorkspaceRow
              title={t.venueOpen}
              detail={t.venueOpenDetail}
              onPress={() => router.push('/open-a-venue')}
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

          {/* The admin console is a desktop web app now, at its own
              deployment. Platform work is monitoring and adjudication done
              sitting down — a verification queue and a policy table are not
              phone work — and a second implementation on a 390-point screen
              was one more place for the two to disagree.

              `platformRole` is no longer read here as a result. It is still on
              the session, because `identityFailed` needs it to tell a dropped
              connection apart from a demotion, and Owner Mode still shows. */}

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
                  {t.restartToMirror}
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

          {signedIn ? <ChangePassword /> : null}

          {signedIn ? (
            <WorkspaceRow
              title={t.blockedPlayers}
              detail={t.blockedPlayersDetail}
              onPress={() => router.push('/blocked')}
            />
          ) : null}

          {/* The policy and the terms were linked from the sign-up screen and
              nowhere else, so a reviewer signing in with the demo account — or
              anybody who accepted them once and wanted to read them again —
              could not reach either from inside the app. Two links rather than
              one row, because they are two documents and picking between them
              should not depend on knowing about a long press. */}
          {legalConfigured ? <LegalLinks /> : null}

          {signedIn ? (
            <WorkspaceRow
              title={t.signOut}
              detail={displayName ? t.signedInAs(displayName) : t.endThisSession}
              onPress={() => void signOut()}
            />
          ) : null}

          {/* Last, and on its own, because it is the one row here that cannot
              be undone. Apple has required this since 2022 and there was
              nothing anywhere in the app that removed a person. */}
          {signedIn ? <DeleteAccount /> : null}
        </View>
      </View>
    </Screen>
  );
}

/** The Void card itself — X-to-void geometry behind the numbers. */
function VoidCard({
  name,
  photoUrl,
  ovr,
  positionCode,
  confidence,
  attributes,
  explained,
  level,
}: {
  name: string;
  photoUrl?: string | null;
  ovr: number;
  positionCode: string;
  confidence: string;
  attributes: { key: string; value: number }[];
  explained: string;
  level: number;
}) {
  // Every number on the card goes through the reader's own numerals. It used
  // to render them raw, so an Arabic card showed `الموسم ١` at the top, `75`
  // in the middle and `من أين جاء ٨٥` underneath — three numerals in two
  // systems on one screen, about the same player.
  const { num } = useI18n();

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
        {/* The face sits inside the inner ring and under the strokes, so the
            card's geometry still reads as the frame rather than as decoration
            laid over a photograph. Without one the rings enclose the void the
            design intends, which is why nothing stands in for it. */}
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            accessibilityIgnoresInvertColors
            style={{
              position: 'absolute',
              top: 122,
              left: '50%',
              marginLeft: -56,
              width: 112,
              height: 112,
              borderRadius: radius.pill,
              opacity: 0.92,
            }}
            resizeMode="cover"
          />
        ) : null}
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
        {/* The void at the centre — and only when there is a void. It is
            painted at the exact middle of where the photograph goes, so on a
            card with a face it was a filled disc over the player's face. The
            rings and strokes still frame the portrait; this one piece is what
            stands in for a portrait that is not there. */}
        {photoUrl ? null : (
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
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          {/* No line-height under 1 here. At 52pt a 0.9 multiplier gives the
              line less room than the face needs and iOS clips the top of the
              digits rather than letting them overflow. */}
          <Txt size={52} weight="extrabold" em={-0.04} lh={1} color={gold.base}>
            {num(ovr)}
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
            {confidence}
          </Txt>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', gap: 3 }}>
        <Txt size={21} weight="bold" em={0.02} color={onVoid.primary}>
          {name.toUpperCase()}
        </Txt>
        <Txt size={9.5} weight="semibold" em={0.2} color="rgba(198,163,75,.85)">
          VOID CARD · LVL {num(level)}
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
                  {num(attr.value)}
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
  const { reason, t, num, shortDate } = useI18n();

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

/**
 * Changing your own password. `change_password` was granted and tested and had
 * no caller in either client: nobody using this product could change their
 * password at all.
 */
/**
 * Leaving, and meaning it.
 *
 * Two taps, and the second one says what goes. The server refuses if this
 * person is a club's captain or a venue's only owner, because those are other
 * people's problems rather than theirs — and it says which, by name.
 */
function DeleteAccount() {
  const { reason, t } = useI18n();
  const { signOut } = useSession();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await deleteMyAccount();
      if (!res.ok) {
        setNotice(res.reason ? (reason(res.reason) ?? res.reason) : t.listUnreachable);
        setBusy(false);
        return;
      }
      // The row is gone; the session it was signing is meaningless now.
      await signOut();
    } catch {
      setNotice(t.listUnreachable);
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.deleteAccount}
        onPress={() => setAsking(true)}
        style={{ paddingVertical: 14, paddingHorizontal: 14 }}
      >
        <Txt size={13.5} weight="semibold" color={burgundy.action}>
          {t.deleteAccount}
        </Txt>
        <Txt size={11.5} color={onVoid.faint}>
          {t.deleteAccountDetail}
        </Txt>
      </Pressable>
    );
  }

  return (
    <View
      style={{
        padding: 16,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: 'rgba(101,21,37,.5)',
        backgroundColor: 'rgba(101,21,37,.09)',
        gap: 12,
      }}
    >
      <Txt size={15} weight="bold" color={onVoid.primary}>
        {t.deleteAccountTitle}
      </Txt>
      <Txt size={12.5} lh={1.55} color={onVoid.secondary}>
        {t.deleteAccountBlurb}
      </Txt>
      {notice ? (
        <Txt size={12} lh={1.5} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}
      <View style={{ gap: 8 }}>
        <Button
          label={busy ? t.deleteAccountWorking : t.deleteAccountConfirm}
          variant="danger"
          disabled={busy}
          onPress={() => void go()}
        />
        <Button
          label={t.keepAccount}
          variant="ghost"
          disabled={busy}
          onPress={() => {
            setAsking(false);
            setNotice(null);
          }}
        />
      </View>
    </View>
  );
}

function ChangePassword() {
  const { reason, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <WorkspaceRow
        title={t.changePassword}
        detail={done ? t.passwordChanged : t.authPasswordHint}
        onPress={() => {
          setOpen(true);
          setDone(false);
          setNotice(null);
        }}
      />
    );
  }

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    const res = await changePassword(current, next).catch(() => ({
      ok: false,
      reason: t.offline,
    }));
    setBusy(false);
    if (res.ok) {
      setCurrent('');
      setNext('');
      setDone(true);
      setOpen(false);
    } else {
      setNotice(reason(res.reason) ?? t.passwordChangeFailed);
    }
  };

  return (
    <View
      style={{
        gap: 10,
        padding: 14,
        borderRadius: radius.control,
        backgroundColor: void_.surface,
        borderWidth: 1,
        borderColor: onVoid.edge,
      }}
    >
      <Txt size={13.5} weight="semibold" color={onVoid.primary}>
        {t.changePassword}
      </Txt>
      <PasswordField label={t.currentPassword} value={current} onChangeText={setCurrent} />
      <PasswordField label={t.newPassword} value={next} onChangeText={setNext} />
      {notice ? (
        <Txt size={12} weight="semibold" color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={busy ? t.authWorking : t.ownSave}
          flex={1}
          height={42}
          disabled={busy || current.length === 0 || next.length < 8}
          onPress={submit}
        />
        <Button label={t.close} variant="ghost" flex={1} height={42} onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={{ gap: 5 }}>
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry
        accessibilityLabel={label}
        placeholderTextColor={onVoid.disabled}
        style={{
          height: 44,
          borderRadius: radius.row,
          borderWidth: 1,
          borderColor: onVoid.line,
          paddingHorizontal: 12,
          color: onVoid.primary,
          fontSize: 14,
        }}
      />
    </View>
  );
}

/** The two published documents, reachable from inside the app. */
function LegalLinks() {
  const { t } = useI18n();
  const link = (label: string, url: string) => (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={() => void Linking.openURL(url)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Txt size={12.5} weight="semibold" color={gold.base}>
        {label}
      </Txt>
    </Pressable>
  );

  return (
    <View style={{ gap: 8, paddingHorizontal: 14, paddingTop: 4 }}>
      <Txt size={11.5} color={onVoid.faint}>
        {t.legalRowDetail}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        {link(t.termsLink, TERMS_URL)}
        {link(t.privacyLink, PRIVACY_URL)}
      </View>
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
/**
 * An account whose card could not be read. Deliberately not `NoCardYet`: that
 * one offers "Build my card", which for an established player would overwrite
 * a real self-assessment because the network dropped for a second.
 */
function CardUnreachable() {
  const { reason, t } = useI18n();
  return (
    <View
      style={{
        width: 262,
        height: 372,
        borderRadius: radius.card,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: onVoid.line,
        backgroundColor: void_.surface,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 26,
        gap: 14,
      }}
    >
      <VoidMark size={96} rings={2} />
      <View style={{ gap: 8, alignItems: 'center' }}>
        <Txt size={17} weight="bold" align="center" color={onVoid.primary}>
          {t.cardUnreachable}
        </Txt>
        <Txt size={12.5} lh={1.5} align="center" color={onVoid.faint}>
          {t.cardUnreachableBlurb}
        </Txt>
      </View>
    </View>
  );
}

function NoCardYet({ onStart }: { onStart: () => void }) {
  const { reason, t } = useI18n();
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

/**
 * Setting the photo on your own card.
 *
 * Two states, not three: there is a photo or there is not. "Uploading" is the
 * label on the button rather than a spinner somewhere else, because the thing
 * that is busy is the thing you pressed.
 */
function PhotoControl({
  userId,
  hasPhoto,
  onChanged,
}: {
  userId: string | null;
  hasPhoto: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const { reason, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function choose() {
    if (!userId || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const picked = await pickAndUpload('avatars', userId);
      if (picked.status === 'ok') {
        const res = await setMyPhoto(picked.url);
        if (!res.ok) setNotice(reason(res.reason) ?? t.uploadFailed);
        else await onChanged();
      } else if (picked.status === 'denied') setNotice(t.photoPermission);
      else if (picked.status === 'too-large') setNotice(t.photoTooLarge);
      else if (picked.status === 'failed') setNotice(t.uploadFailed);
    } catch {
      setNotice(t.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    try {
      await setMyPhoto(null);
      await onChanged();
    } catch {
      setNotice(t.uploadFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ width: '100%', gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          label={busy ? t.uploading : hasPhoto ? t.changePhoto : t.addPhoto}
          variant="ghost"
          flex={1}
          disabled={busy || !userId}
          onPress={choose}
        />
        {hasPhoto ? (
          <Button label={t.removePhoto} variant="ghost" flex={1} disabled={busy} onPress={clear} />
        ) : null}
      </View>
      {notice ? (
        <Txt size={12} color={burgundy.action}>
          {notice}
        </Txt>
      ) : null}
    </View>
  );
}

/**
 * "I can play tonight."
 *
 * One press, and it lapses by itself at the end of the day. That expiry is the
 * whole design: a permanent flag would be wrong for half the people carrying
 * it within a fortnight, and a captain let down twice stops trusting the list.
 * Saying so under the switch matters as much as the switch — somebody who
 * thinks they have set it for good will not understand why nobody calls.
 *
 * The count of matching calls is the reason to press it. "Available" on its
 * own is a setting; "2 matches are looking for players" is an invitation.
 */
function ReadyToPlay() {
  const router = useRouter();
  const { t, num } = useI18n();
  const [state, setState] = useState<Availability | null>(null);
  // The switch's own position, separate from the server's answer.
  //
  // It used to be driven straight off `state.available`, which only changes
  // once two round trips have finished. On Android that reads as a fault: the
  // native switch moves its thumb the instant it is touched, React re-renders
  // with the value still unchanged and pushes the old position back down, so
  // the thumb snaps back — then flips again half a second later when the
  // server replies. Flip, snap back, flip. iOS hides it because its switch
  // reconciles a late value differently, which is why this only showed up on
  // the Android build.
  //
  // So the switch answers the thumb, and the network catches up behind it.
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await myAvailability();
      setState(next);
      setOn(next.available);
    } catch {
      /* The switch simply does not appear rather than showing a wrong one. */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!state) return null;

  const toggle = async () => {
    if (busy) return;
    const next = !on;
    setBusy(true);
    setOn(next);
    // On the gesture, not on the reply. A confirmation that arrives after the
    // network has answered is not feedback for the tap, it is news.
    void Haptics.selectionAsync();
    try {
      await setAvailability(next);
      // For `openCalls`, and so the server has the last word on the state.
      await load();
    } catch {
      // Put it back. Leaving it where the thumb went would tell somebody they
      // are available to a database that never heard about it.
      setOn(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={{
        width: '100%',
        padding: 14,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: on ? goldAlpha.frame : onVoid.edgeFaint,
        backgroundColor: on ? goldAlpha.fill : void_.surface,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt size={14} weight="semibold" color={on ? gold.base : onVoid.primary}>
            {on ? t.readyOn : t.readyOff}
          </Txt>
          <Txt size={11.5} lh={1.5} color={onVoid.faint}>
            {on ? t.readyOnBlurb : t.readyOffBlurb}
          </Txt>
        </View>
        {/* Not `disabled` while the write is in flight. Android greys the whole
            control out, which on a half-second request is a flicker rather
            than information — and the guard at the top of `toggle` already
            refuses the second tap. */}
        <Switch
          value={on}
          onValueChange={() => void toggle()}
          trackColor={{ false: void_.inset, true: goldAlpha.frame }}
          thumbColor={on ? gold.base : onVoid.dim}
          accessibilityLabel={t.readyOn}
        />
      </View>

      {on && state.openCalls > 0 ? (
        <Button
          label={t.callsWaiting(num(state.openCalls))}
          height={40}
          size={13}
          onPress={() => router.push('/play/calls')}
        />
      ) : null}
    </View>
  );
}
