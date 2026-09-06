/**
 * The database's refusals, in Arabic.
 *
 * Every function in this schema answers a refused write with a sentence rather
 * than a code — which is right, because a code has to be translated somewhere
 * anyway and a sentence at least says something true when nothing translates
 * it. But the sentences are English, and until now they went straight onto the
 * screen: an Arabic player who tried to enter a full cup was told, in English,
 * "That cup is full."
 *
 * So this maps them. Three things about the shape:
 *
 * It is keyed on the exact English sentence rather than on an error code. That
 * is a real cost — a sentence reworded in a migration silently falls back —
 * and `scripts/check-reasons.mjs` exists to pay it: it re-reads every refusal
 * out of `supabase/migrations/` and fails when one is not covered here. The
 * alternative was adding a code column to a hundred and sixty return
 * statements, which is a larger change to a working, tested schema for a
 * benefit the check already provides.
 *
 * The fallback is the English sentence, never a generic apology. "Something
 * went wrong" tells a captain nothing they can act on; "That cup is full",
 * even in the wrong language, tells them to look for another cup.
 *
 * And a handful of refusals are assembled by `format()` with a number in them.
 * Those cannot be matched literally, so they are handled by the patterns at the
 * bottom — matched in order, before the exact table is consulted.
 */

import type { Locale } from './index';

/** Western digits to Arabic-Indic, the way `num` renders every other figure. */
const digits = (s: string) => s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/** Refusals assembled at runtime, matched before the exact table. */
const PATTERNS: { re: RegExp; ar: (m: RegExpMatchArray) => string }[] = [
  // A cup's minimum age, refused by naming who is under it — a count would
  // make the captain guess which of eight people it is.
  {
    re: /^This cup is for players aged (\d+) and over\. Too young: (.+)\.$/,
    ar: (m) => `البطولة دي للاعبين من ${digits(m[1])} سنة وفوق. صغيرين: ${m[2]}.`,
  },
  // Leaving is refused by naming the thing other people depend on, so the club
  // and the venue arrive inside the sentence.
  {
    re: /^You captain (.+)\. Hand the club to somebody else before you leave\.$/,
    ar: (m) => `إنت كابتن ${m[1]}. سلّم النادي لحد تاني الأول قبل ما تمشي.`,
  },
  {
    re: /^You are the only owner of (.+)\. Add another owner before you leave\.$/,
    ar: (m) => `إنت المالك الوحيد لـ${m[1]}. ضيف مالك تاني قبل ما تمشي.`,
  },
  // The three notifications a two-sided result produces. They carry a score, so
  // they cannot be keyed on an exact sentence — and a notification is the one
  // piece of server text a person reads without having asked for it, which
  // makes leaving it in English worse than leaving a refusal in English.
  {
    re: /^They say you won (\d+)–(\d+)$/,
    ar: (m) => `يقولون إنك فزت ${digits(m[1])}–${digits(m[2])}`,
  },
  {
    re: /^They say you lost (\d+)–(\d+)$/,
    ar: (m) => `يقولون إنك خسرت ${digits(m[1])}–${digits(m[2])}`,
  },
  {
    re: /^They say it ended (\d+)–(\d+)$/,
    ar: (m) => `يقولون إنها انتهت ${digits(m[1])}–${digits(m[2])}`,
  },
  {
    // `club_eligibility`, nested inside the entry refusal below.
    re: /^Needs (\d+) more starters and (\d+) more substitutes\.$/,
    ar: (m) => `ينقصه ${digits(m[1])} أساسيين و${digits(m[2])} بدلاء.`,
  },
  {
    re: /^Needs (\d+) more starters?\.$/,
    ar: (m) => `ينقصه ${digits(m[1])} من الأساسيين.`,
  },
  {
    re: /^Needs (\d+) more substitutes?\.$/,
    ar: (m) => `ينقصه ${digits(m[1])} من البدلاء.`,
  },
  {
    re: /^Your club cannot enter yet\. (.+)$/,
    ar: (m) => `ناديك لا يستطيع المشاركة بعد. ${translateReason(m[1], 'ar')}`,
  },
  {
    re: /^You need (\d+) players in the team to enter\.$/,
    ar: (m) => `تحتاج إلى ${digits(m[1])} لاعبين في الفريق للمشاركة.`,
  },
  {
    re: /^(.+) is not an attribute on the card\.$/,
    ar: (m) => `${m[1]} ليست إحدى صفات البطاقة.`,
  },
  {
    re: /^Unknown position (.*)$/,
    ar: (m) => `مركز غير معروف ${m[1]}`,
  },
];

const AR: Record<string, string> = {
  'A captain cannot remove themselves. Hand the club over first.':
    'لا يستطيع الكابتن إخراج نفسه. سلّم النادي أولًا.',
  'A channel needs a label and a value.': 'القناة تحتاج إلى اسم وقيمة.',
  'A club already goes by that name.': 'هناك نادٍ بهذا الاسم بالفعل.',
  'A club needs a name.': 'النادي يحتاج إلى اسم.',
  'A free code carries neither an amount nor a percentage.':
    'كود الدخول المجاني لا يحمل مبلغًا ولا نسبة.',
  'A percentage code needs a percentage between 1 and 100, and no amount.':
    'كود النسبة يحتاج إلى نسبة بين ١ و١٠٠، وبلا مبلغ.',
  'A place is either a starter or a sub.': 'المكان إما أساسي أو بديل.',
  'A player is a starter or a substitute.': 'اللاعب إما أساسي أو بديل.',
  'A playing captain is a starter or a substitute.': 'الكابتن الذي يلعب إما أساسي أو بديل.',
  'A price cannot be negative.': 'السعر لا يكون بالسالب.',
  'A rating runs from 1 to 5.': 'التقييم من ١ إلى ٥.',
  'An amount code needs an amount in EGP, and no percentage.':
    'كود المبلغ يحتاج إلى مبلغ بالجنيه، وبلا نسبة.',
  'Answer at least one question.': 'أجب عن سؤال واحد على الأقل.',
  'Both sub places are taken.': 'مكانا البدلاء محجوزان.',
  'Choose a reason.': 'اختر سببًا.',
  'Choose player or venue owner.': 'اختر لاعبًا أو صاحب ملعب.',
  'Closing time cannot be before opening time.': 'موعد الإغلاق لا يسبق موعد الفتح.',
  'Confirm the booking before inviting your squad.': 'أكّد الحجز قبل دعوة فريقك.',
  'Enter a valid phone number.': 'أدخل رقم هاتف صحيحًا.',
  'Entries have closed.': 'أُغلق باب الاشتراك.',
  'Every answer runs from 1 to 99.': 'كل إجابة من ١ إلى ٩٩.',
  'Every rating runs from 1 to 99.': 'كل تقييم من ١ إلى ٩٩.',
  'Fixtures have already been drawn.': 'أُجريت القرعة بالفعل.',
  'Give the pitch a name.': 'أعطِ الملعب اسمًا.',
  'Give the team a name.': 'أعطِ الفريق اسمًا.',
  'Give the tournament a name.': 'أعطِ البطولة اسمًا.',
  'Give the venue a name and an area.': 'أعطِ الملعب اسمًا ومنطقة.',
  'You are not in that club.': 'إنت مش في النادي ده.',
  'This club is waiting to be admitted by X League.':
    'النادي ده مستني القبول من إكس ليج.',
  'This club was not admitted to X League.':
    'النادي ده ما اتقبلش في إكس ليج.',
  'That venue is waiting to be verified.': 'الملعب ده مستني التوثيق.',
  'That club does not exist.': 'النادي ده مش موجود.',
  'You cannot block yourself.': 'مينفعش تحظر نفسك.',
  'That player does not exist.': 'اللاعب ده مش موجود.',
  'You cannot message that player.': 'مينفعش تبعت للاعب ده.',
  'Enter the year you were born.': 'اكتب سنة ميلادك.',
  'Choose one.': 'اختر واحد.',
  'That cup does not exist.': 'البطولة دي مش موجودة.',
  'That cup has matches already played. It cannot be reopened for entries.':
    'البطولة دي فيها ماتشات اتلعبت. مينفعش تتفتح للاشتراك تاني.',
  'You already have a venue waiting to be verified.':
    'عندك ملعب مستني التوثيق بالفعل.',
  'Hand the club to somebody else before leaving it.': 'سلّم النادي لشخص آخر قبل مغادرته.',
  'Hours run from 0 to 24.': 'الساعات من ٠ إلى ٢٤.',
  'Name the player you are inviting.': 'اكتب اسم اللاعب الذي تدعوه.',
  'No fixture in this cup has been played.': 'لم تُلعب أي مباراة في هذه البطولة.',
  'No score has been reported for that match.': 'لم تُسجَّل نتيجة لهذه المباراة.',
  'No staff account with that username.': 'لا يوجد حساب موظف بهذا الاسم.',
  'No such account.': 'لا يوجد حساب كهذا.',
  'No such code.': 'لا يوجد كود كهذا.',
  'No such cup.': 'لا توجد بطولة كهذه.',
  'No such payment channel.': 'لا توجد قناة دفع كهذه.',
  'Not authorised.': 'غير مصرّح لك.',
  'Only a checked-in booking becomes a match.': 'الحجز الذي تم تسجيل الحضور فيه هو وحده ما يصير مباراة.',
  'Only a confirmed booking can be checked in.': 'لا يُسجَّل الحضور إلا لحجز مؤكَّد.',
  'Only a confirmed booking can be marked a no-show.': 'لا يُسجَّل التخلّف إلا لحجز مؤكَّد.',
  'Only the captain can change the crest.': 'الكابتن وحده يغيّر الشعار.',
  'Only the captain can change the squad.': 'الكابتن وحده يغيّر التشكيلة.',
  'Only the captain can hand the club over.': 'الكابتن وحده يسلّم النادي.',
  'Only the captain can invite players.': 'الكابتن وحده يدعو اللاعبين.',
  'Only the captain can pick the squad.': 'الكابتن وحده يختار التشكيلة.',
  'Only the captain can remove players.': 'الكابتن وحده يخرج اللاعبين.',
  'Only the captain or the venue can report a result.': 'الكابتن أو الملعب وحدهما يسجّلان النتيجة.',
  'Only the captain who entered can confirm the payment.': 'الكابتن الذي اشترك وحده يؤكّد الدفع.',
  'Only the club captain can enter a cup.': 'كابتن النادي وحده يشترك في البطولة.',
  'Only the team captain can enter a tournament.': 'كابتن الفريق وحده يشترك في البطولة.',
  'Rate at least one attribute.': 'قيّم صفة واحدة على الأقل.',
  'Ratings for that match have closed.': 'أُغلق تقييم هذه المباراة.',
  'Say what you sent and how, so it can be matched.':
    'اكتب ماذا أرسلت وكيف، حتى يمكن مطابقته.',
  'Sign in first.': 'سجّل الدخول أولًا.',
  'Sign in to complete your assessment.': 'سجّل الدخول لإكمال تقييمك.',
  'Sign in to rate your teammates.': 'سجّل الدخول لتقييم زملائك.',
  'Sign in to report something.': 'سجّل الدخول للإبلاغ.',
  'Sign in to search for players.': 'سجّل الدخول للبحث عن لاعبين.',
  'Sign in to see your card.': 'سجّل الدخول لرؤية بطاقتك.',
  'Sign in to send a message.': 'سجّل الدخول لإرسال رسالة.',
  'Sign in to start a team.': 'سجّل الدخول لتكوين فريق.',
  'Slow down a moment.': 'على مهلك لحظة.',
  'Somebody has already booked that hour. Cancel the booking first.':
    'حجز أحدهم هذه الساعة بالفعل. ألغِ الحجز أولًا.',
  'Tell us your name.': 'اكتب اسمك.',
  'That account already has a password. Use the recovery code instead.':
    'هذا الحساب له كلمة مرور بالفعل. استخدم كود الاسترجاع.',
  'That account has no recovery code. Ask an administrator.':
    'هذا الحساب بلا كود استرجاع. اطلبه من المسؤول.',
  'That booking cannot be cancelled.': 'هذا الحجز لا يمكن إلغاؤه.',
  'That booking is not yours to cancel.': 'هذا الحجز ليس لك حتى تلغيه.',
  'That booking no longer exists.': 'هذا الحجز لم يعد موجودًا.',
  'That closure no longer exists.': 'هذا الإغلاق لم يعد موجودًا.',
  'That club no longer exists.': 'هذا النادي لم يعد موجودًا.',
  'That code already exists.': 'هذا الكود موجود بالفعل.',
  'That code has been used already.': 'استُخدم هذا الكود من قبل.',
  'That code has expired.': 'انتهت صلاحية هذا الكود.',
  'That code is for a different cup.': 'هذا الكود لبطولة أخرى.',
  'That code is no longer active.': 'هذا الكود لم يعد ساريًا.',
  'That code is not recognised.': 'هذا الكود غير معروف.',
  'That code was used up while you were entering.':
    'استُهلك هذا الكود أثناء اشتراكك.',
  'That cup has already been settled.': 'حُسمت هذه البطولة بالفعل.',
  'That cup is full.': 'هذه البطولة مكتملة.',
  'That cup no longer exists.': 'هذه البطولة لم تعد موجودة.',
  'That did not work.': 'لم ينجح ذلك.',
  'That entry no longer exists.': 'هذا الاشتراك لم يعد موجودًا.',
  'That fixture has not been scheduled on a pitch.': 'لم تُحدَّد لهذه المباراة ساعة على ملعب.',
  'That fixture no longer exists.': 'هذه المباراة لم تعد موجودة.',
  'That hold belongs to someone else.': 'هذا الحجز المؤقت يخص شخصًا آخر.',
  'That hold is no longer active.': 'هذا الحجز المؤقت لم يعد ساريًا.',
  'That invitation is not yours.': 'هذه الدعوة ليست لك.',
  'That invitation no longer exists.': 'هذه الدعوة لم تعد موجودة.',
  'That is not a day of the week.': 'هذا ليس يومًا من أيام الأسبوع.',
  'That is not a console account, so there would be no way back into it.':
    'هذا ليس حساب لوحة تحكم، فلن تكون هناك طريقة للعودة إليه.',
  'That is not a resolution.': 'هذا ليس قرارًا صالحًا.',
  'That is not a valid range of hours.': 'هذا ليس نطاق ساعات صالحًا.',
  'That is not a verification state.': 'هذه ليست حالة توثيق صالحة.',
  'That is not a web address.': 'هذا ليس عنوان موقع.',
  'That is not something you can report.': 'هذا ليس مما يمكن الإبلاغ عنه.',
  'That is not your current password.': 'هذه ليست كلمة مرورك الحالية.',
  'That match has already been played.': 'هذه المباراة لُعبت بالفعل.',
  'That match has not been played yet.': 'هذه المباراة لم تُلعب بعد.',
  'That match has not finished yet.': 'هذه المباراة لم تنتهِ بعد.',
  'That match has not started yet.': 'هذه المباراة لم تبدأ بعد.',
  'That match no longer exists.': 'هذه المباراة لم تعد موجودة.',
  'That message is too long.': 'هذه الرسالة طويلة أكثر من اللازم.',
  'That number already has an account. Sign in instead.':
    'هذا الرقم له حساب بالفعل. سجّل الدخول.',
  'That person does not have an X League account.': 'هذا الشخص ليس له حساب في إكس ليج.',
  'That pitch no longer exists.': 'هذا الملعب لم يعد موجودًا.',
  'That place no longer exists.': 'هذا المكان لم يعد موجودًا.',
  'That player only takes messages from people they have played with.':
    'اللاعب ده مش بيستقبل رسائل غير من اللي لعبوا معاه.',
  'Only the captain can call for players.':
    'الكابتن بس هو اللي ينادي على لاعبين.',
  'Confirm the booking before calling for players.':
    'أكّد الحجز الأول قبل ما تنادي على لاعبين.',
  'That match has already kicked off.':
    'الماتش ده بدأ خلاص.',
  'That is not a position.':
    'ده مش مركز.',
  'A rating is between 1 and 99.':
    'التقييم بين ١ و٩٩.',
  'Ask for between one and ten players.':
    'اطلب من لاعب لعشرة لاعبين.',
  'That call is not open to you any more.':
    'النداء ده مابقاش متاح ليك.',
  'There is no call to close.':
    'مافيش نداء تقفله.',
  'There is nothing to withdraw.':
    'مافيش حاجة تسحبها.',
  'That offer is no longer open.':
    'العرض ده مابقاش مفتوح.',
  'Sign in to call for players.':
    'سجّل الدخول عشان تنادي على لاعبين.',
  'Sign in to answer a call.':
    'سجّل الدخول عشان ترد على النداء.',
  'Sign in to see this.':
    'سجّل الدخول عشان تشوف ده.',
  'Sign in to see who needs players.':
    'سجّل الدخول عشان تشوف مين محتاج لاعبين.',
  'Sign in to say you are available.':
    'سجّل الدخول عشان تقول إنك فاضي.',
  'Only the captain can see this.':
    'الكابتن بس هو اللي يشوف ده.',
  'Only the captain can see who answered.':
    'الكابتن بس هو اللي يشوف مين رد.',
  'That player does not have an X League account.': 'هذا اللاعب ليس له حساب في إكس ليج.',
  'That report no longer exists.': 'هذا البلاغ لم يعد موجودًا.',
  'That slot is no longer available.': 'هذه الساعة لم تعد متاحة.',
  'That slot is already taken on this pitch.': 'هذه الساعة محجوزة على هذا الملعب.',
  'That team no longer exists.': 'هذا الفريق لم يعد موجودًا.',
  'That tournament is full.': 'هذه البطولة مكتملة.',
  'That tournament no longer exists.': 'هذه البطولة لم تعد موجودة.',
  'That username and code do not match.': 'اسم المستخدم والكود غير متطابقين.',
  'That venue does not exist.': 'هذا الملعب غير موجود.',
  'That venue no longer exists.': 'هذا الملعب لم يعد موجودًا.',
  'The deposit cannot be more than the price.': 'التأمين لا يزيد عن السعر.',
  'The starting five is full.': 'الخماسي الأساسي مكتمل.',
  'There is already a pitch with that name.': 'هناك ملعب بهذا الاسم بالفعل.',
  'There is no open invitation for you here.': 'لا توجد دعوة مفتوحة لك هنا.',
  'There is no such setting.': 'لا يوجد إعداد كهذا.',
  'There is no table to settle from.': 'لا يوجد جدول تُحسم منه البطولة.',
  'There is nothing outstanding of that kind.': 'لا يوجد مستحق من هذا النوع.',
  'They are already in this club, or have been asked.':
    'هو في هذا النادي بالفعل، أو وُجّهت له دعوة.',
  'They are already in this squad.': 'هو في هذه التشكيلة بالفعل.',
  'They are not an active member of this club.': 'ليس عضوًا نشطًا في هذا النادي.',
  'They are not in this club.': 'ليس في هذا النادي.',
  'They did not play in that match.': 'لم يلعب في هذه المباراة.',
  'Too many attempts. Try again in a few minutes.':
    'محاولات كثيرة. أعد المحاولة بعد دقائق.',
  'Use a password of at least 8 characters.': 'استخدم كلمة مرور من ٨ حروف على الأقل.',
  'Use at least 8 characters.': 'استخدم ٨ حروف على الأقل.',
  'Write something first.': 'اكتب شيئًا أولًا.',
  'You are not a member of that team.': 'لست عضوًا في هذا الفريق.',
  'You are not in that conversation.': 'لست في هذه المحادثة.',
  'You are not in this club.': 'لست في هذا النادي.',
  'You are not part of that match.': 'لست جزءًا من هذه المباراة.',
  'You are the captain — cancel the booking instead.': 'أنت الكابتن — ألغِ الحجز بدلًا من ذلك.',
  'You can message players you have shared a team or a pitch with.':
    'يمكنك مراسلة من شاركتهم فريقًا أو ملعبًا.',
  'You can only rate a match you played in.': 'لا تقيّم إلا مباراة لعبتها.',
  'You can only review a booking you made.': 'لا تقيّم إلا حجزًا قمت به.',
  'You can review a match once you have played it.': 'يمكنك تقييم المباراة بعد أن تلعبها.',
  'You cannot change your own role.': 'لا يمكنك تغيير دورك أنت.',
  'You cannot grant a role above your own.': 'لا يمكنك منح دور أعلى من دورك.',
  'You cannot message yourself.': 'لا يمكنك مراسلة نفسك.',
  'You cannot rate yourself.': 'لا يمكنك تقييم نفسك.',
  'You cannot remove yourself from your own booking.': 'لا يمكنك إخراج نفسك من حجزك.',
  'You cannot report yourself.': 'لا يمكنك الإبلاغ عن نفسك.',
  'You cannot suspend yourself.': 'لا يمكنك إيقاف نفسك.',
  'You did not play in that match.': 'لم تلعب في هذه المباراة.',
  'You do not have a place in that match.': 'ليس لك مكان في هذه المباراة.',
  'You do not have access to that venue.': 'ليس لك وصول إلى هذا الملعب.',
  'You do not have permission to do that.': 'ليس لديك صلاحية لفعل ذلك.',
  'You do not manage that cup.': 'أنت لا تدير هذه البطولة.',
  'Say what you saw. Nothing counts until you both agree.':
    'سجّل ما رأيته. لا شيء يُحتسب قبل أن تتفقا.',
  'The two sides disagree': 'الطرفان غير متفقين',
  'You and your opponent reported different scores. The organiser will settle it.':
    'سجّلت أنت وخصمك نتيجتين مختلفتين. المنظّم هو من يحسم الأمر.',
  'Only the two captains report this match.':
    'كابتنا الفريقين وحدهما من يسجّلان نتيجة هذه المباراة.',
  'A captain records their own side only.':
    'الكابتن يسجّل لفريقه هو فقط.',
  'That match has only one side to report it. The captain\'s report stands.':
    'هذه المباراة لها طرف واحد يسجّلها، وتقرير الكابتن هو المعتمد.',
  'Sign in to report a result.': 'سجّل الدخول لتسجيل النتيجة.',
  'Only the captain, the venue or the organiser can record scorers.':
    'الكابتن أو الملعب أو منظّم البطولة وحدهم من يسجّلون أسماء الهدّافين.',
  'Report the score first.': 'سجّل النتيجة أولًا.',
  'Send the sheet as a list.': 'أرسل القائمة في صورة قائمة.',
  'That is not a player.': 'هذا ليس لاعبًا.',
  'Goals and assists cannot be negative.':
    'لا يمكن أن تكون الأهداف والصناعات بالسالب.',
  'Somebody on that sheet did not play in the match.':
    'أحد المذكورين في القائمة لم يشارك في المباراة.',
  'More goals on the sheet than in the score.':
    'عدد الأهداف في القائمة أكبر من نتيجة المباراة.',
  'Nothing on the sheet can be negative.':
    'لا يمكن أن يكون أي رقم في القائمة بالسالب.',
  'The referee has recorded this match.':
    'الحكم سجّل نتيجة هذه المباراة.',
  'Give the referee a name.': 'اكتب اسم الحكم.',
  'Give the destination a name.': 'اكتب اسمًا لوسيلة التحويل.',
  'Give the number or handle to send to.': 'اكتب الرقم أو المعرّف اللي هيتحوّل عليه.',
  'That destination is not this venue\'s.': 'وسيلة التحويل دي مش بتاعة الملعب ده.',
  'That destination no longer exists.': 'وسيلة التحويل دي لم تعد موجودة.',
  'That booking is not yours.': 'الحجز ده مش بتاعك.',
  'Only the captain who booked can confirm the payment.':
    'الكابتن اللي حجز هو الوحيد اللي يقدر يأكّد التحويل.',
  'There is nothing outstanding on that booking.': 'مفيش مبلغ متبقّي على الحجز ده.',
  'That referee does not exist.': 'هذا الحكم غير موجود.',
  'Only a knockout has rounds to draw.':
    'بطولات خروج المغلوب وحدها هي التي تُسحب لها جولات تالية.',
  'Make the draw first.': 'أجرِ القرعة أولًا.',
  'Every match in the round has to be played first.':
    'يجب أن تُلعب كل مباريات الجولة أولًا.',
  'A knockout tie cannot be left level. Record the score that decided it.':
    'لا يمكن أن تنتهي مباراة خروج المغلوب بالتعادل. سجّل النتيجة التي حسمتها.',
  'That was the final. Settle the cup to award it.':
    'تلك كانت المباراة النهائية. أغلق البطولة لتُمنح ألقابها.',
  'That match was booked through the app. The captain reports it.':
    'هذه المباراة محجوزة عبر التطبيق، والكابتن هو من يسجّل نتيجتها.',
  'That result has already been recorded.': 'النتيجة مُسجَّلة بالفعل.',
  'A bye has no result.': 'المباراة التي بلا خصم ليس لها نتيجة.',
  'Put the match on a ground and an hour first.':
    'حدِّد ملعب المباراة وموعدها أولًا.',
  'Give both scores.': 'أدخل نتيجة الفريقين.',
  'Matches are already placed there. Move them first.':
    'هناك مباريات مُحدَّدة على هذا الملعب بالفعل. انقلها أولًا.',
  'That pitch is not at a ground this cup is played on.':
    'هذا الملعب ليس ضمن الملاعب التي تُقام عليها البطولة.',
  'You do not manage that tournament.': 'أنت لا تدير هذه البطولة.',
  'You do not manage that venue.': 'أنت لا تدير هذا الملعب.',
  'You have already answered that invitation.': 'أجبت عن هذه الدعوة بالفعل.',
  'You have no open invitation to that team.': 'ليست لك دعوة مفتوحة لهذا الفريق.',
  'You have no profile yet.': 'ليس لك ملف بعد.',
  'You need at least two accepted entrants.': 'تحتاج إلى مشتركَين مقبولَين على الأقل.',
  'You need at least two accepted teams.': 'تحتاج إلى فريقَين مقبولَين على الأقل.',
  'You no longer have that many points.': 'لم تعد لديك هذه النقاط.',
  'Your club has already entered this cup.': 'ناديك مشترك في هذه البطولة بالفعل.',
  'Your hold expired — the slot is back on sale.':
    'انتهى حجزك المؤقت — عادت الساعة للبيع.',
};

/**
 * The refusal in this reader's language, or the English one when it is not
 * mapped — which says something true rather than hiding what happened.
 */
export function translateReason(reason: string | null | undefined, locale: Locale): string | null {
  if (!reason) return null;
  if (locale !== 'ar') return reason;

  for (const { re, ar } of PATTERNS) {
    const m = reason.match(re);
    if (m) return ar(m);
  }
  return AR[reason] ?? reason;
}

/** For the coverage check, which reads this rather than duplicating the list. */
export const TRANSLATED_REASONS = AR;
export const REASON_PATTERNS = PATTERNS.map((p) => p.re);
