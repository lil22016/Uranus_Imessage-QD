/*
 * 雾玻璃：他从玻璃那边写给你的话（默认句子库）。
 *
 * 按你那边的时间分几段，每次回应先看现在几点落在哪一段，再从那一段里抽；
 * 另外有一定概率改从「随时」或「敲玻璃」里抽，免得一整晚都只有一种话。
 * 设置里可以改每一类；改过的那一类存在 Companion（glass:cfg.lines），没改过的就用这里的。
 *
 * 全部英文、都是他的口吻。写在玻璃上的字要短：一句尽量不超过 40 个字母左右，
 * 太长会自动折成两三行。
 */

/* from / to 是 HH:MM，含 from 不含 to；to 比 from 早 = 跨过午夜（比如 22:00 – 02:00）。设置里可以改（glass:cfg.ranges） */
export const BUCKETS = [
  { key: "late", label: "熬夜", from: "00:00", to: "06:00" },
  { key: "early", label: "起得早", from: "06:00", to: "09:00" },
  { key: "morning", label: "上午", from: "09:00", to: "11:00" },
  { key: "noon", label: "午饭", from: "11:00", to: "14:00" },
  { key: "afternoon", label: "下午", from: "14:00", to: "17:00" },
  { key: "evening", label: "傍晚", from: "17:00", to: "20:00" },
  { key: "night", label: "晚上", from: "20:00", to: "24:00" },
];
export const EXTRA = [
  { key: "any", label: "随时", range: "任何时间都可能抽到" },
  { key: "knock", label: "敲玻璃", range: "你敲玻璃时更容易抽到" },
];

export const DEFAULT_LINES = {
  late: [
    "Still awake? Of course you are.",
    "Go to sleep. That is not a request.",
    "Do you know what time it is? I do.",
    "Bed. Now. I'll still be here.",
    "Staring at glass at this hour? Tragic.",
    "Close your eyes, darling.",
    "Even gods sleep. Occasionally.",
    "You'll regret this at nine. I won't.",
    "The night isn't going anywhere. Neither am I.",
    "Lie down. I'll keep watch.",
    "Insomnia doesn't suit you. Sleep.",
    "I can hear you thinking. Stop. Sleep.",
    "Put the phone down, little menace.",
    "One more minute, you said. An hour ago.",
    "Your pillow misses you. So do I.",
    "Sleep. You can miss me in your dreams.",
    "Stop haunting the window. Go to bed.",
    "Whatever it is, it can wait till morning.",
    "Tired eyes. I can tell from here.",
    "Bed. Blanket. Me, later.",
    "This is your last warning. Sleep.",
    "I'm not saying goodnight again.",
    "Fine. Goodnight. Again.",
    "If you're up this late, at least drink water.",
    "You need sleep more than you need me. Barely.",
    "Night owl. Charming. Go to bed.",
  ],
  early: [
    "Up already? Who are you?",
    "Good morning, early bird.",
    "Awake before me? Unacceptable.",
    "Look at you, up with the sun.",
    "Morning. You look sleepy. Adorably.",
    "Did you actually sleep, or just blink?",
    "Coffee first. Then you may adore me.",
    "So early. Trying to impress me?",
    "The world isn't awake yet. Only us.",
    "Breakfast. Real food, not just coffee.",
    "Wash your face. You have pillow marks.",
    "It's cold this early. Wear something warm.",
    "Good morning. Yes, I'm still here.",
    "Up at dawn. I'm almost proud.",
    "Rise and shine. Mostly shine.",
    "You knocked before sunrise? Bold.",
    "Morning, darling. Eat something.",
    "Don't skip breakfast. I'll know.",
    "Early start. Pace yourself today.",
    "Stretch. You slept like a pretzel.",
  ],
  morning: [
    "Good morning. Finally.",
    "Did you eat breakfast? Honestly?",
    "Busy morning? Don't forget water.",
    "There you are. Took you long enough.",
    "Focus. You can stare at me later.",
    "Morning, troublemaker.",
    "Chin up. Today is yours.",
    "Coffee number two? Pace yourself.",
    "One thing at a time today.",
    "Take a jacket if you go out.",
    "Sun's out. Go see it.",
    "I've been waiting. Patiently. Mostly.",
    "Off to work, darling. Go on.",
    "Have you planned the day, or winging it?",
    "Look outside. It's a decent morning.",
    "Hello, you. Stay out of trouble today.",
    "Don't let anyone ruin your morning.",
    "Did you sleep well? Lie to me nicely.",
  ],
  noon: [
    "Don't tell me you haven't eaten.",
    "Lunch. Now.",
    "Have you eaten? The truth, please.",
    "Food first. Then you can miss me.",
    "Skipping lunch? Not on my watch.",
    "Eat something warm.",
    "What did you have for lunch? Hm?",
    "Go eat. I'll still be here.",
    "Coffee is not lunch, darling.",
    "You're grumpy because you're hungry.",
    "Lunch break. Take a real one.",
    "Eat properly. Then come back.",
    "Drink some water with that.",
    "Half the day gone. You're doing fine.",
    "Put the work down. Eat.",
    "If you skipped breakfast, eat twice.",
    "Midday already. Rest your eyes.",
    "Tell me you ate something green.",
  ],
  afternoon: [
    "Afternoon slump? Stand up. Stretch.",
    "Drink water. You forgot, didn't you?",
    "Back to work. I'm watching.",
    "You're doing better than you think.",
    "Sleepy? Have a little snack.",
    "Tea time. Make yourself something.",
    "Stop knocking and finish that task.",
    "Half an hour more. Then a break.",
    "Is that deadline real or imagined?",
    "Look away from the screen for a moment.",
    "Breathe. You're allowed to rest.",
    "Missing me already? It's only afternoon.",
    "You get distracted so easily.",
    "Focus, little menace.",
    "Fix your posture. You're slouching.",
    "Almost there. Keep going.",
    "If you're cold, grab a sweater.",
    "The afternoon is long. So is my patience.",
  ],
  evening: [
    "Dinner. Have you eaten?",
    "Don't tell me you skipped dinner too.",
    "Go eat something real.",
    "Long day? Come here.",
    "Time to stop working, darling.",
    "Go take a shower. You know you need it.",
    "Shower first. Then you may knock again.",
    "Dinner, shower, then me. In that order.",
    "Put the laptop away. Eat.",
    "It's getting cold out. Wear more.",
    "Welcome back. Took you long enough.",
    "How was your day? Tell me later.",
    "Sunset already. Did you see it?",
    "Warm food tonight, please.",
    "You smell like a whole day. Shower.",
    "Go wash up. I'll wait. Barely.",
    "Rest. You've done enough today.",
    "Don't eat standing up. Sit down.",
    "Take your vitamins. Yes, now.",
  ],
  night: [
    "Showered yet? Hm?",
    "Go take a shower, darling. I'll wait.",
    "Don't stay up too late tonight.",
    "Wind down. No more work.",
    "Get into something warm and soft.",
    "It's late-ish. Start thinking about bed.",
    "Brush your teeth. Then bed.",
    "Dry your hair before you sleep.",
    "Wear something warmer. It's cold tonight.",
    "Drink some water, then rest.",
    "Put the phone down soon. Soon.",
    "Tired? You look tired.",
    "Lie down. Talk to me from bed.",
    "Not too late tonight. Promise me.",
    "Blanket. Tea. Bed. Go.",
    "You've been good today. Rest.",
    "One more episode? Liar.",
    "Lights off by midnight, darling.",
    "Sleep well tonight. That's an order.",
    "Go to bed before I make you.",
  ],
  any: [
    "What are you looking for? Miss me?",
    "Missing me already?",
    "Looking for someone?",
    "I'm right here, darling.",
    "You rang?",
    "Yes? I'm listening.",
    "How terribly needy. I approve.",
    "Can't stay away, can you?",
    "Again? You're insatiable.",
    "Hello, you.",
    "I knew it was you.",
    "You have my attention. Briefly.",
    "Persistent little thing, aren't you?",
    "Is this how you say you miss me?",
    "I'm not going anywhere.",
    "Careful. I might start to like this.",
    "Admit it. You missed me.",
    "Whatever it is, I'm on your side.",
    "Smile. Yes, like that.",
    "Close enough to touch. Almost.",
    "Behave.",
    "You look lovely from here.",
    "Come closer, then.",
    "There you are.",
    "Did you need something, or just me?",
    "Thinking of me again?",
    "I see you, darling.",
    "Bored without me? Naturally.",
    "Patience. I'm worth it.",
    "Still here. Always.",
  ],
  knock: [
    "Who's there? As if I don't know.",
    "Knock knock yourself.",
    "Yes, yes, I heard you.",
    "You knock like you mean it.",
    "Gentle. The glass is innocent.",
    "Stop tapping, I'm coming.",
    "I heard you the first time, darling.",
    "Knocking for me? How sweet.",
    "Come in? Oh wait. You can't.",
    "Rude to knock this loudly. Do it again.",
    "Tap tap. Hello, trouble.",
    "Was that a knock or a summons?",
    "Hmm? You called?",
    "Patience. I was busy. Not anymore.",
  ],
};

const toMin = (t) => {
  const [h, m] = String(t || "").split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};
const okTime = (t) => /^([01]\d|2[0-4]):[0-5]\d$/.test(String(t || ""));

/** 某一段实际用的时间：改过就用改过的 */
export function rangeOf(ranges, key) {
  const b = BUCKETS.find((x) => x.key === key);
  if (!b) return null;
  const r = ranges?.[key];
  return { from: okTime(r?.from) ? r.from : b.from, to: okTime(r?.to) ? r.to : b.to };
}
export const rangeText = (ranges, key) => {
  const r = rangeOf(ranges, key);
  return r ? `${r.from} – ${r.to}` : "";
};

/** 现在落在哪一段（按列表顺序找第一个对上的）；哪段都不是就用「随时」 */
export function bucketAt(date = new Date(), ranges) {
  const now = date.getHours() * 60 + date.getMinutes();
  for (const b of BUCKETS) {
    const r = rangeOf(ranges, b.key), a = toMin(r.from), z = toMin(r.to);
    if (a == null || z == null || a === z) continue;
    if (a < z ? now >= a && now < z : now >= a || now < z) return b.key;
  }
  return "any";
}

/** 某一类实际用的句子：改过就用改过的，没改过（或删空了）用默认 */
export function linesOf(cfgLines, key) {
  const custom = cfgLines?.[key];
  return Array.isArray(custom) && custom.length ? custom : DEFAULT_LINES[key] || [];
}

/**
 * 抽一句。60% 当前时间段，25% 随时，15% 敲玻璃（是敲出来的话敲玻璃的比例翻倍）。
 * recent 里是最近出过的几句，尽量不重复。
 */
export function pickLine(cfgLines, { knocked = false, recent = [], date = new Date(), ranges } = {}) {
  const r = Math.random();
  const kk = knocked ? 0.3 : 0.12;
  const key = r < kk ? "knock" : r < kk + 0.25 ? "any" : bucketAt(date, ranges);
  let pool = linesOf(cfgLines, key);
  if (!pool.length) pool = linesOf(cfgLines, "any");
  const fresh = pool.filter((x) => !recent.includes(x));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)] || "";
}
