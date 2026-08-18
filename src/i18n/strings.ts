/**
 * Copy for the player surface, English and Arabic.
 *
 * NFR-LOC-001 requires both directions fully supported. The Arabic here is the
 * copy option 1i drew where the design provides it, and follows its register
 * elsewhere: direct, second person, no marketing voice.
 *
 * Owner Mode and the admin console are not translated yet — see the README.
 */
export const STRINGS = {
  en: {
    // Home (P-02)
    greetingEvening: 'Evening',
    tonightAt: 'Tonight',
    matchLobby: 'Match lobby',
    navigate: 'Navigate',
    cashDepositAtGate: (amount: string) => `${amount} cash deposit due at the gate`,
    liveNearYou: 'Live near you',
    slotsCount: (n: string) => `${n} slots`,
    invitation: 'Invitation',
    needsA: (who: string, position: string) => `${who} needs a ${position}`,
    accept: 'Accept',
    decline: 'Decline',
    progression: 'Progression',
    xpOf: (have: string, need: string) => `${have} / ${need} XP`,
    levelToNext: (level: string, xp: string, next: string) => `Level ${level} · ${xp} XP to Level ${next}`,
    confirmedOf: (have: string, total: string, subs: string) =>
      `${have} of ${total} · ${subs} sub slots open`,
    venueMeta: (distance: string, price: string) => `${distance} km · 5-a-side · ${price}/hr`,
    moreSlots: (n: string) => `+${n} more`,
    today: 'Tuesday 18 August',

    // Play (P-03)
    whenPlay: 'When do you want to play?',
    tonight: 'Tonight',
    tomorrow: 'Tomorrow',
    pickDate: 'Pick date',
    list: 'List',
    map: 'Map',
    liveSlots: (n: string) => `${n} live slots`,
    updatedAgo: (secs: string) => `Updated ${secs} sec ago`,
    verified: 'VERIFIED',
    perHour: (amount: string) => `${amount} / hour`,
    fullyBooked: 'Fully booked tonight · notify me',
    slotsLeftTonight: (n: string) => `${n} slots left tonight`,

    // Pitch (P-04)
    availableTonight: 'Available tonight',
    houseRules: 'House rules',
    hold: (time: string) => `Hold ${time}`,
    signInToHold: (time: string) => `Sign in to hold ${time}`,
    perHourLabel: 'per hour',
    calendarNote:
      'Slots update live from the venue calendar — phone and walk-in bookings included.',
    calendarChecking: 'Checking the venue calendar…',
    calendarUnreachable: 'Could not reach the venue calendar — these times may be out of date.',
    stillFree: (times: string) => `Still free: ${times}`,

    // Checkout (P-05)
    confirmYourSlot: 'Confirm your slot',
    slotHeld: 'Slot held for you',
    holdExpired: 'Your hold expired — the slot is back on sale',
    venue: 'Venue',
    date: 'Date',
    time: 'Time',
    format: 'Format',
    fiveASide: '5-a-side · 5 + 2 subs',
    payment: 'Payment',
    cashAtVenue: 'Cash deposit at the venue',
    cashExplainer: (deposit: string, balance: string) =>
      `Pay ${deposit} at the gate to hold the pitch. The remaining ${balance} is settled at the venue after the match.`,
    pitchHour: 'Pitch hour',
    bookingFee: 'Booking fee',
    cashAtGate: 'Cash at gate',
    balanceAfter: 'Balance after match',
    confirmBooking: 'Confirm booking',
    findAnotherSlot: 'Find another slot',
    cancellationNote:
      'Free cancellation until 3:00 PM today. Two unexcused no-shows in a season restrict cash-deposit bookings.',

    // Confirmation (P-06)
    yourePlaying: "You're playing",
    tonightAtTime: (time: string) => `Tonight, ${time}`,
    bookingCode: 'Booking code',
    navigateToVenue: 'Navigate to venue',
    inviteYourSquad: 'Invite your 4 + subs',
    bookingWhen: (date: string, from: string, to: string) => `${date} · ${from}–${to} · 5-a-side`,
    gateNote: 'Gate 2 · ask for Pitch A · arrive 10 minutes early',

    // Lobby (P-13)
    matchLobbyTitle: 'Match lobby',
    squad: 'Squad · 5-a-side',
    confirmedCount: (n: string) => `${n} of 5 confirmed`,
    lobbyChat: 'Lobby chat',
    messageSquad: 'Message squad',
    cancelBooking: 'Cancel booking',
    held: 'Held',
    confirmed: 'Confirmed',
    checkIn: 'Check-in',
    result: 'Result',

    // Card (P-08 / P-09)
    yourCard: 'Your card',
    season: (n: string) => `Season ${n}`,
    form: 'FORM',
    verifiedMatches: 'VERIFIED',
    raters: 'RATERS',
    matches: (n: string) => `${n} matches`,
    whereFrom: (value: string, key: string) => `Where ${value} ${key} comes from`,
    matchEvidence: 'Match evidence',
    selfAssessment: 'Self-assessment',
    workspace: 'Workspace',
    account: 'Account',
    ownerMode: 'Owner mode',
    adminConsole: 'Admin console',
    signIn: 'Sign in',
    signOut: 'Sign out',
    noCardYet: 'No card yet',
    noCardBlurb: 'Six questions about how you actually play. It takes about a minute.',
    buildMyCard: 'Build my card',
    language: 'Language',

    // Tabs
    home: 'Home',
    play: 'Play',
    cups: 'Cups',
    chat: 'Chat',
    me: 'Me',
  },

  ar: {
    greetingEvening: 'مساء الخير',
    tonightAt: 'الليلة',
    matchLobby: 'غرفة المباراة',
    navigate: 'الاتجاهات',
    cashDepositAtGate: (amount: string) => `تأمين نقدي ${amount} عند البوابة`,
    liveNearYou: 'متاح بالقرب منك',
    slotsCount: (n: string) => `${n} مواعيد`,
    invitation: 'دعوة',
    needsA: (who: string, position: string) => `${who} يحتاج ${position}`,
    accept: 'قبول',
    decline: 'رفض',
    progression: 'التقدم',
    xpOf: (have: string, need: string) => `${have} / ${need} نقطة خبرة`,
    levelToNext: (level: string, xp: string, next: string) =>
      `المستوى ${level} · ${xp} نقطة للمستوى ${next}`,
    // Two numerals either side of a neutral separator get reordered by the
    // bidi algorithm and read as one number, so the Arabic phrasing keeps a
    // word between them rather than a middot.
    confirmedOf: (have: string, total: string, subs: string) =>
      `${have} من ${total} مؤكدين، و${subs} مكان للبدلاء`,
    venueMeta: (distance: string, price: string) => `${distance} كم · خماسي · ${price}/ساعة`,
    moreSlots: (n: string) => `${n} مواعيد أخرى`,
    today: 'الثلاثاء ١٨ أغسطس',

    whenPlay: 'إمتى عايز تلعب؟',
    tonight: 'الليلة',
    tomorrow: 'بكرة',
    pickDate: 'اختر التاريخ',
    list: 'قائمة',
    map: 'خريطة',
    liveSlots: (n: string) => `${n} موعد متاح`,
    updatedAgo: (secs: string) => `آخر تحديث من ${secs} ثانية`,
    verified: 'موثّق',
    perHour: (amount: string) => `${amount} / ساعة`,
    fullyBooked: 'محجوز بالكامل الليلة · نبّهني',
    slotsLeftTonight: (n: string) => `باقي ${n} مواعيد الليلة`,

    availableTonight: 'المتاح الليلة',
    houseRules: 'قواعد الملعب',
    hold: (time: string) => `احجز ${time}`,
    signInToHold: (time: string) => `سجّل الدخول لحجز ${time}`,
    perHourLabel: 'للساعة',
    calendarNote: 'المواعيد تتحدث مباشرة من جدول الملعب — شاملة حجوزات الهاتف والحضور.',
    calendarChecking: 'جارٍ قراءة جدول الملعب…',
    calendarUnreachable: 'تعذّر الوصول لجدول الملعب — قد تكون المواعيد قديمة.',
    stillFree: (times: string) => `ما زال متاحًا: ${times}`,

    confirmYourSlot: 'أكّد موعدك',
    slotHeld: 'الموعد محجوز لك',
    holdExpired: 'انتهى الحجز المؤقت — الموعد رجع للبيع',
    venue: 'الملعب',
    date: 'التاريخ',
    time: 'الوقت',
    format: 'النظام',
    fiveASide: 'خماسي · ٥ + ٢ بدلاء',
    payment: 'الدفع',
    cashAtVenue: 'تأمين نقدي في الملعب',
    cashExplainer: (deposit: string, balance: string) =>
      `ادفع ${deposit} عند البوابة لتثبيت الحجز. الباقي ${balance} يُدفع في الملعب بعد المباراة.`,
    pitchHour: 'ساعة الملعب',
    bookingFee: 'رسوم الحجز',
    cashAtGate: 'نقداً عند البوابة',
    balanceAfter: 'الباقي بعد المباراة',
    confirmBooking: 'تأكيد الحجز',
    findAnotherSlot: 'ابحث عن موعد آخر',
    cancellationNote:
      'إلغاء مجاني حتى ٣:٠٠ م اليوم. الغياب مرتين بدون عذر في الموسم يقيّد الحجز بالتأمين النقدي.',

    yourePlaying: 'أنت تلعب',
    tonightAtTime: (time: string) => `الليلة، ${time}`,
    bookingCode: 'كود الحجز',
    navigateToVenue: 'الاتجاهات للملعب',
    inviteYourSquad: 'ادعُ فريقك والبدلاء',
    bookingWhen: (date: string, from: string, to: string) => `${date} · ${from} – ${to} · خماسي`,
    gateNote: 'بوابة ٢ · اطلب ملعب أ · احضر قبلها بعشر دقائق',

    matchLobbyTitle: 'غرفة المباراة',
    squad: 'الفريق · خماسي',
    confirmedCount: (n: string) => `${n} من ٥ مؤكدين`,
    lobbyChat: 'دردشة الغرفة',
    messageSquad: 'راسل الفريق',
    cancelBooking: 'إلغاء الحجز',
    held: 'محجوز',
    confirmed: 'مؤكد',
    checkIn: 'تسجيل الحضور',
    result: 'النتيجة',

    yourCard: 'كارتك',
    season: (n: string) => `الموسم ${n}`,
    form: 'الحالة',
    verifiedMatches: 'موثّقة',
    raters: 'المقيّمون',
    matches: (n: string) => `${n} مباراة`,
    whereFrom: (value: string, key: string) => `من أين جاء ${value} ${key}`,
    matchEvidence: 'أدلة المباريات',
    selfAssessment: 'التقييم الذاتي',
    workspace: 'مساحة العمل',
    account: 'الحساب',
    ownerMode: 'وضع المالك',
    adminConsole: 'لوحة الإدارة',
    signIn: 'تسجيل الدخول',
    signOut: 'تسجيل الخروج',
    noCardYet: 'لا يوجد كارت بعد',
    noCardBlurb: 'ست أسئلة عن أسلوب لعبك الحقيقي. تستغرق دقيقة تقريبًا.',
    buildMyCard: 'أنشئ كارتي',
    language: 'اللغة',

    home: 'الرئيسية',
    play: 'العب',
    cups: 'البطولات',
    chat: 'الرسائل',
    me: 'حسابي',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['en'];
