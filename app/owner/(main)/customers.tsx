import { ScrollView, View } from 'react-native';
import { Txt } from '@/components/Txt';
import { gold, ink, onOperative, operative, radius } from '@/theme/tokens';
import { CUSTOMERS } from '@/data/ownerOps';

/**
 * O-04 Customers — the venue CRM, not a social graph (§4.5).
 */
export default function OwnerCustomers() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: operative.bg }}
      contentContainerStyle={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 24, gap: 12 }}
      showsVerticalScrollIndicator={false}
    >
      <Txt size={10} weight="semibold" em={0.16} upper color={onOperative.faint}>
        Known captains and regulars
      </Txt>
      {CUSTOMERS.map((c) => (
        <View
          key={c.name}
          style={{
            padding: 14,
            borderRadius: radius.panel,
            backgroundColor: operative.surface,
            borderWidth: 1,
            borderColor: onOperative.hairline,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              backgroundColor: operative.band,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Txt size={11} weight="bold" color={ink}>
              {c.initials}
            </Txt>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Txt size={14.5} weight="bold" color={ink}>
              {c.name}
            </Txt>
            <Txt size={12} color={onOperative.muted}>
              {c.last} · {c.visits} visits
            </Txt>
            <Txt size={11.5} color={onOperative.faint}>
              {c.note}
            </Txt>
          </View>
          <Txt size={12} weight="semibold" color={c.outstanding ? gold.ink : onOperative.dim}>
            {c.outstanding ? `EGP ${c.outstanding}` : 'Clear'}
          </Txt>
        </View>
      ))}
    </ScrollView>
  );
}
