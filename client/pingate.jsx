/**
 * 打开 app 先过一道 4 位数字密码（像手机锁屏）。
 *
 * 两层各管一件事：
 *   - 设备登录（服务器的 cookie，见 functions/_middleware.js）：这台设备是不是你的。
 *     第一次用账号密码登录，之后记 180 天。
 *   - 这个 4 位密码：谁拿着已经登录的设备。只存在这台设备上（加盐哈希，不上传），
 *     所以不能单靠它进来 —— 没有设备登录，4 位数字根本到不了后端。
 *
 * 流程：
 *   第一次（设备已登录、还没设密码）→ 设 4 位密码（也可以「先不设置」）
 *   以后每次打开 → 输 4 位密码
 *   切到后台超过 5 分钟再回来 → 再锁一次（界面盖在上面，底下的编辑内容不会丢）
 *   忘了 → 退出这台设备的登录，用账号密码重新登录，再设新的
 *
 * 另外：模块一加载就先去叫醒后端（后端每次冷启动要几秒），
 * 等你输完密码，它多半已经醒了，不用再对着空白屏等。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { UranusBadge } from "./ui.jsx";

const PIN_KEY = "uranus.pin.v1";
const SKIP_KEY = "uranus.pin.skip";
const RELOCK_MS = 5 * 60 * 1000;
const MAX_TRIES = 5;
const COOLDOWN_MS = 30_000;

// 预热：结果不用，只为了让后端先醒
try {
  fetch("/api/auth/state").catch(() => {});
} catch {
  /* 没事 */
}

function readPin() {
  try {
    const v = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
    return v && v.salt && v.hash ? v : null;
  } catch {
    return null;
  }
}
function readSkip() {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}
async function digest(pin, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function newSalt() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function PinGate({ children }) {
  const [pin, setPin] = useState(readPin);
  const [opened, setOpened] = useState(() => !readPin() && readSkip());
  const [locked, setLocked] = useState(() => Boolean(readPin()));

  const needSetup = !pin && !opened;

  // 回到前台时，离开超过 5 分钟就再锁
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= RELOCK_MS && readPin()) setLocked(true);
      hiddenAt = 0;
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const onUnlock = useCallback(() => {
    setLocked(false);
    setOpened(true);
  }, []);

  const onSet = useCallback(async (code) => {
    const salt = newSalt();
    const rec = { salt, hash: await digest(code, salt) };
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(rec));
      localStorage.removeItem(SKIP_KEY);
    } catch {
      /* 存不进去就这次有效 */
    }
    setPin(rec);
    setLocked(false);
    setOpened(true);
  }, []);

  const onSkip = useCallback(() => {
    try {
      localStorage.setItem(SKIP_KEY, "1");
    } catch {
      /* 没事 */
    }
    setOpened(true);
  }, []);

  const onForgot = useCallback(() => {
    if (!window.confirm("会退出这台设备的登录，用账号密码重新登录后再设新的 4 位密码。继续？")) return;
    try {
      localStorage.removeItem(PIN_KEY);
      localStorage.removeItem(SKIP_KEY);
    } catch {
      /* 没事 */
    }
    fetch("/__auth/logout", { method: "POST" }).finally(() => location.reload());
  }, []);

  const showLock = locked || needSetup;
  return (
    <>
      {opened && children}
      {showLock && (
        <Lock
          key={locked ? "enter" : "set"}
          mode={locked ? "enter" : "set"}
          saved={pin}
          onUnlock={onUnlock}
          onSet={onSet}
          onSkip={onSkip}
          onForgot={onForgot}
        />
      )}
    </>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

function Lock({ mode, saved, onUnlock, onSet, onSkip, onForgot }) {
  const [digits, setDigits] = useState("");
  const [first, setFirst] = useState("");
  const [msg, setMsg] = useState("");
  const [tries, setTries] = useState(0);
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);

  const cooling = until > now;

  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= until) {
        setUntil(0);
        setTries(0);
        setMsg("");
      }
    }, 500);
    return () => clearInterval(t);
  }, [until]);

  const submit = async (code) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (mode === "enter") {
        if ((await digest(code, saved.salt)) === saved.hash) {
          onUnlock();
          return;
        }
        const t = tries + 1;
        setTries(t);
        if (t >= MAX_TRIES) {
          setUntil(Date.now() + COOLDOWN_MS);
          setNow(Date.now());
          setMsg("错误次数太多，30 秒后再试。");
        } else {
          setMsg(`密码不对，还能试 ${MAX_TRIES - t} 次。`);
        }
        setDigits("");
      } else if (!first) {
        setFirst(code);
        setDigits("");
        setMsg("");
      } else if (code === first) {
        await onSet(code);
      } else {
        setFirst("");
        setDigits("");
        setMsg("两次不一样，重新来。");
      }
    } finally {
      busy.current = false;
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  useEffect(() => {
    if (digits.length === 4) submitRef.current(digits);
  }, [digits]);

  const press = useCallback(
    (k) => {
      if (cooling) return;
      if (k === "del") setDigits((d) => d.slice(0, -1));
      else setDigits((d) => (d.length < 4 ? d + k : d));
    },
    [cooling]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("del");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const title = mode === "enter" ? "输入密码" : first ? "再输入一次" : "设一个 4 位密码";
  const hint = mode === "set" && !first ? "以后每次打开只要输这个。" : "";

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-y-auto bg-paper px-6"
      style={{ height: "100dvh" }}
    >
      <UranusBadge size={52} />
      <p className="mt-5 font-serif text-h2 text-ink">{title}</p>
      <p className="mt-1 min-h-[18px] text-meta text-ink-faint">{msg || hint}</p>

      <div className="my-6 flex gap-4" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full border border-ink ${i < digits.length ? "bg-ink" : ""}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-x-5 gap-y-4">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={cooling}
              onClick={() => press(k)}
              aria-label={k === "del" ? "删除" : k}
              className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-line font-serif text-h2 text-ink active:bg-ink/10 disabled:opacity-40"
            >
              {k === "del" ? <Delete size={22} /> : k}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={mode === "enter" ? onForgot : onSkip}
        className="mt-8 text-meta text-ink-faint underline underline-offset-4"
      >
        {mode === "enter" ? "忘记密码？" : "先不设置，记住这台设备就行"}
      </button>
    </div>
  );
}
