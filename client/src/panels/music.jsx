import { Headphones } from "lucide-react";
import { Card } from "../ui.jsx";

/**
 * 一起听歌（占位）。
 *
 * 入口先留好：主屏幕上的耳机图标、左侧导航里的「一起听歌」都指到这里。
 * 之后要接的东西：选歌 / 歌单、播放、和角色「一起听」时的同步（谁在听、听到哪、
 * 角色在听的时候说点什么）。这一页现在只是一块空地。
 */
export function MusicPanel() {
  return (
    <Card title="一起听" desc="和角色戴着同一副耳机。这一块还在装修，入口先放在这儿。">
      <div className="flex items-center gap-4 border border-line p-5">
        <Headphones size={28} strokeWidth={1.5} className="shrink-0 text-ink-faint" />
        <p className="text-meta leading-relaxed text-ink-faint">
          还没接上播放。之后这里会放：歌单、正在听什么、角色听到一半说的话。
        </p>
      </div>
    </Card>
  );
}
