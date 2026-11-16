import { useEffect, useState } from 'react'
import { T } from '../../core/copy'
import { getDB } from '../../core/db'
import { pad2 } from '../../core/format'
import { adapters } from '../../platforms'
import { go, href } from '../router'
import { BoxIcon, CloudSticker, FlowerSticker, HeartSticker, MemoIcon, MoonSticker, SettingsIcon, SparkleSticker, StarSticker, Tape, WhaleSticker } from '../stickers'

function greeting(h: number): string {
  if (h < 5) return T.home.greetNight
  if (h < 11) return T.home.greetMorning
  if (h < 14) return T.home.greetNoon
  if (h < 19) return T.home.greetNoon
  if (h < 23) return T.home.greetEvening
  return T.home.greetNight
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function Home() {
  const now = useNow()
  const month = now.getMonth() + 1
  const date = now.getDate()
  const week = T.weekdays[now.getDay()]

  const openPlatform = async (platformId: string) => {
    let has = false
    try {
      has = (await getDB().conversations.where('platformId').equals(platformId).filter((c) => !c.hiddenAt).count()) > 0
    } catch {
      has = false
    }
    go(has ? href(['p', platformId]) : href(['p', platformId, 'import']))
  }

  return (
    <div className="screen home">
      <div className="home-deco" aria-hidden="true">
        <CloudSticker className="deco d1" size={92} />
        <SparkleSticker className="deco d2" size={34} />
        <StarSticker className="deco d3" size={30} />
        <HeartSticker className="deco d4" size={28} />
        <CloudSticker className="deco d5" size={70} />
        <FlowerSticker className="deco d6" size={36} />
        <MoonSticker className="deco d7" size={30} />
      </div>
      <div className="content home-content">
        <div className="home-clock">
          <div className="clock-time">
            {pad2(now.getHours())}:{pad2(now.getMinutes())}
          </div>
          <div className="clock-date">
            {month}月{date}日 {week}
          </div>
          <p className="clock-greet">
            {greeting(now.getHours())},{T.home.greetSub}
          </p>
        </div>

        <nav className="app-grid" aria-label={T.appName}>
          {adapters.map((a) => (
            <button key={a.platform.id} type="button" className="app-icon" onClick={() => openPlatform(a.platform.id)}>
              <span className="icon-tile photo">
                <img src={`./${a.icon}`} alt="" width={72} height={72} />
              </span>
              <span className="icon-label">{a.platform.name}</span>
            </button>
          ))}
          <button type="button" className="app-icon" onClick={() => go(href(['memo']))}>
            <span className="icon-tile">
              <MemoIcon size={64} />
            </span>
            <span className="icon-label">{T.home.memo}</span>
          </button>
          <button type="button" className="app-icon" onClick={() => go(href(['export']))}>
            <span className="icon-tile">
              <BoxIcon size={64} />
            </span>
            <span className="icon-label">{T.home.export}</span>
          </button>
          <button type="button" className="app-icon" onClick={() => go(href(['settings']))}>
            <span className="icon-tile">
              <SettingsIcon size={64} />
            </span>
            <span className="icon-label">{T.home.settings}</span>
          </button>
        </nav>

        <aside className="widget">
          <Tape className="tape-top" />
          <WhaleSticker size={64} />
          <div>
            <strong>{T.home.widgetTitle}</strong>
            <p>{T.home.widgetBody}</p>
          </div>
        </aside>
      </div>
      <footer className="dock">
        <span>{T.home.dock}</span>
      </footer>
    </div>
  )
}
