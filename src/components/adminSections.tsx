import { View } from 'react-native';
import { Txt } from '@/components/Txt';
import { burgundy, gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import {
  ADMIN_REPORTS,
  ADMIN_TOURNAMENTS,
  ADMIN_USERS,
  ADMIN_VENUES,
  MATCH_DESK,
  MODERATION,
  SEASON,
} from '@/data/admin';
import { mono } from '@/theme/typography';

export function AdminSectionBody({ section }: { section: string }) {
  switch (section) {
    case 'Venues':
      return (
        <Table
          title="Venues"
          headers={['Venue', 'Area', 'Pitches', 'Occ.', 'Status']}
          rows={ADMIN_VENUES.map((v) => [v.name, v.area, String(v.pitches), v.occupancy, v.status])}
          alert={ADMIN_VENUES.map((v) => v.status === 'Watch')}
        />
      );
    case 'Users & teams':
      return (
        <Table
          title="Users & teams"
          headers={['Name', 'Role', 'Card / scope', 'Flag']}
          rows={ADMIN_USERS.map((u) => [u.name, u.role, u.card, u.flag || '—'])}
        />
      );
    case 'Tournaments':
      return (
        <Table
          title="Tournaments"
          headers={['Cup', 'Stage', 'Teams', 'Next']}
          rows={ADMIN_TOURNAMENTS.map((t) => [t.name, t.stage, String(t.teams), t.next])}
        />
      );
    case 'Match desk':
      return (
        <Table
          title="Match desk"
          headers={['Code', 'Fixture', 'Venue', 'Kick', 'State']}
          rows={MATCH_DESK.map((m) => [m.code, m.fixture, m.venue, m.kick, m.state])}
        />
      );
    case 'Moderation':
      return (
        <View style={{ gap: 10 }}>
          {MODERATION.map((item) => (
            <View
              key={item.id}
              style={{
                padding: 14,
                borderRadius: radius.panel,
                backgroundColor: operative.surface,
                borderWidth: 1,
                borderColor: 'rgba(101,21,37,.22)',
                gap: 4,
              }}
            >
              <Txt size={10} weight="bold" em={0.1} color={burgundy.ink} style={{ fontFamily: mono }}>
                {item.id}
              </Txt>
              <Txt size={14} weight="bold" color={ink}>
                {item.title}
              </Txt>
              <Txt size={12} color={onOperative.muted}>
                {item.detail}
              </Txt>
              <Txt size={11.5} weight="semibold" color={gold.ink}>
                Ready: {item.action}
              </Txt>
            </View>
          ))}
        </View>
      );
    case 'Points & seasons':
      return (
        <View
          style={{
            padding: 16,
            borderRadius: radius.panel,
            backgroundColor: operative.surface,
            borderWidth: 1,
            borderColor: onOperative.hairline,
            gap: 8,
          }}
        >
          <Txt size={16} weight="bold" color={ink}>
            {SEASON.name}
          </Txt>
          <Txt size={13} color={onOperative.muted}>
            {SEASON.window}
          </Txt>
          <Txt size={13} color={onOperative.secondary}>
            {SEASON.xpCap}
          </Txt>
          <Txt size={13} color={onOperative.secondary}>
            {SEASON.decay}
          </Txt>
        </View>
      );
    case 'Reports':
      return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ADMIN_REPORTS.map((r) => (
            <View
              key={r.label}
              style={{
                width: '48%',
                padding: 14,
                borderRadius: radius.panel,
                backgroundColor: operative.surface,
                borderWidth: 1,
                borderColor: onOperative.hairline,
                gap: 6,
              }}
            >
              <Txt size={10} weight="semibold" em={0.12} color={onOperative.faint}>
                {r.label.toUpperCase()}
              </Txt>
              <Txt size={22} weight="bold" color={ink}>
                {r.value}
              </Txt>
              <Txt size={11} color={onOperative.faint}>
                {r.detail}
              </Txt>
            </View>
          ))}
        </View>
      );
    default:
      return null;
  }
}

function Table({
  title,
  headers,
  rows,
  alert,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  alert?: boolean[];
}) {
  return (
    <View
      style={{
        borderRadius: radius.panel,
        backgroundColor: operative.surface,
        borderWidth: 1,
        borderColor: onOperative.hairline,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: onOperative.edge }}>
        <Txt size={12.5} weight="bold" color={ink}>
          {title}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 16, backgroundColor: operative.band }}>
        {headers.map((h) => (
          <Txt key={h} size={9.5} weight="bold" em={0.08} color={onOperative.muted} style={{ flex: 1 }}>
            {h}
          </Txt>
        ))}
      </View>
      {rows.map((row, i) => (
        <View
          key={row.join('|')}
          style={{
            flexDirection: 'row',
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: onOperative.edgeFaint,
            backgroundColor: alert?.[i] ? 'rgba(101,21,37,.06)' : 'transparent',
          }}
        >
          {row.map((cell, j) => (
            <Txt
              key={headers[j]}
              size={11.5}
              color={alert?.[i] && j === headers.length - 1 ? burgundy.ink : ink}
              style={{ flex: 1 }}
            >
              {cell}
            </Txt>
          ))}
        </View>
      ))}
    </View>
  );
}
