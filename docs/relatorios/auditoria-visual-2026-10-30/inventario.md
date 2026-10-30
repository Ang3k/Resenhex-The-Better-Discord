## Tokens definidos em `:root`

O tema padrão passa por três camadas: `style.css` (cores do Discord) → `experience.css` (tema "calmo") → `polish.css` (carvão com roxo, só no tema padrão). O valor que vale é o da última camada.

| Token | Definições (em ordem de carga) |
|---|---|
| `--bg-floating` | experience.css: `#161820` → experience.css `[data-theme=midnight]`: `#0d1424` → experience.css `[data-theme=contrast]`: `#080808` → polish.css `:not([data-theme=midnight]):not([data-th`: `#111113` → style.css: `#111214` |
| `--bg-input` | experience.css: `#343844` → experience.css `[data-theme=midnight]`: `#26324a` → experience.css `[data-theme=contrast]`: `#303030` → polish.css `:not([data-theme=midnight]):not([data-th`: `#26262b` → style.css: `#383a40` |
| `--bg-main` | experience.css: `#2a2d37` → experience.css `[data-theme=midnight]`: `#1b253a` → experience.css `[data-theme=contrast]`: `#1c1c1c` → polish.css `:not([data-theme=midnight]):not([data-th`: `#1e1e22` → style.css: `#313338` |
| `--bg-members` | polish.css `:not([data-theme=midnight]):not([data-th`: `#1b1b1f` → polish.css: `var(--bg-sidebar)` |
| `--bg-panel` | experience.css: `#1c1e26` → experience.css `[data-theme=midnight]`: `#11192b` → experience.css `[data-theme=contrast]`: `#0d0d0d` → polish.css `:not([data-theme=midnight]):not([data-th`: `#232327` → style.css: `#232428` |
| `--bg-rail` | experience.css: `#16171d` → experience.css `[data-theme=midnight]`: `#0e1322` → experience.css `[data-theme=contrast]`: `#090909` → polish.css `:not([data-theme=midnight]):not([data-th`: `#141417` → style.css: `#1e1f22` |
| `--bg-sidebar` | experience.css: `#21232c` → experience.css `[data-theme=midnight]`: `#151d30` → experience.css `[data-theme=contrast]`: `#141414` → polish.css `:not([data-theme=midnight]):not([data-th`: `#18181b` → style.css: `#2b2d31` |
| `--brand` | experience.css: `#8277fa` → experience.css `[data-theme=midnight]`: `#829bf9` → experience.css `[data-theme=contrast]`: `#a39afa` → polish.css `:not([data-theme=midnight]):not([data-th`: `#8e2fd8` → style.css: `#5865f2` |
| `--brand-gradient` | style.css: `linear-gradient(135deg, #6d5dfc, #c64cf0)` |
| `--brand-hover` | experience.css: `#6a60d7` → experience.css `[data-theme=midnight]`: `#657fe4` → polish.css `:not([data-theme=midnight]):not([data-th`: `#7a24bd` → style.css: `#4752c4` |
| `--brand-ink` | polish.css: `color-mix(in srgb, var(--brand) 18%, #fff)` |
| `--brand-soft` | polish.css: `color-mix(in srgb, var(--brand) 16%, transparent)` |
| `--brand-text` | polish.css: `color-mix(in srgb, var(--brand) 50%, #fff)` |
| `--channel` | experience.css: `#a0a8b9` → experience.css `[data-theme=contrast]`: `#d0d0d0` → polish.css `:not([data-theme=midnight]):not([data-th`: `#8a8c95` → style.css: `#80848e` |
| `--chat-size` | experience.css: `16px` |
| `--divider` | experience.css: `#ffffff12` → experience.css `[data-theme=contrast]`: `#ffffff44` → polish.css `:not([data-theme=midnight]):not([data-th`: `rgba(255, 255, 255, .065)` → style.css: `rgba(78, 80, 88, .48)` |
| `--dock-gap` | polish.css: `8px` |
| `--ease-enter` | motion.css: `cubic-bezier(.22, 1, .36, 1)` |
| `--ease-exit` | motion.css: `ease-in` |
| `--ease-out` | motion.css: `var(--ease-enter)` |
| `--font` | style.css: `"Figtree", "gg sans", "Segoe UI Variable Text", "Segoe UI", ` |
| `--green` | experience.css: `#52c9a0` → polish.css `:not([data-theme=midnight]):not([data-th`: `#3fbf85` → style.css: `#23a55a` |
| `--hover` | polish.css `:not([data-theme=midnight]):not([data-th`: `rgba(255, 255, 255, .045)` → style.css: `rgba(78, 80, 88, .3)` |
| `--hover-strong` | polish.css `:not([data-theme=midnight]):not([data-th`: `rgba(255, 255, 255, .08)` → style.css: `rgba(78, 80, 88, .6)` |
| `--interactive` | experience.css: `#b9c1d1` → experience.css `[data-theme=contrast]`: `#e5e5e5` → polish.css `:not([data-theme=midnight]):not([data-th`: `#b3b5bc` → style.css: `#b5bac1` |
| `--link` | polish.css `:not([data-theme=midnight]):not([data-th`: `color-mix(in srgb, var(--brand) 55%, #fff)` → style.css: `#00a8fc` |
| `--mono` | style.css: `Consolas, "Andale Mono WT", "Andale Mono", "Lucida Console",` |
| `--motion-base` | motion.css: `200ms` |
| `--motion-exit` | motion.css: `150ms` |
| `--motion-fast` | motion.css: `150ms` |
| `--motion-large` | motion.css: `400ms` |
| `--motion-slow` | motion.css: `300ms` |
| `--press` | motion.css: `.97` |
| `--press-icon` | motion.css: `.92` |
| `--rail-w` | polish.css: `72px` → polish.css: `64px` |
| `--rarity-common` | mudae-salao.css: `#8e95a2` |
| `--rarity-epic` | mudae-salao.css: `#b46cff` |
| `--rarity-legendary` | mudae-salao.css: `var(--yellow)` |
| `--rarity-rare` | mudae-salao.css: `#3ba7ff` |
| `--red` | experience.css: `#ff7987` → polish.css `:not([data-theme=midnight]):not([data-th`: `#f0565e` → style.css: `#f23f43` |
| `--red-dark` | polish.css `:not([data-theme=midnight]):not([data-th`: `#d9434b` → style.css: `#da373c` |
| `--shadow-float` | style.css: `0 8px 16px rgba(0, 0, 0, .24)` |
| `--shadow-header` | style.css: `0 1px 0 rgba(4, 4, 5, .2), 0 1.5px 0 rgba(6, 6, 7, .05), 0 2` |
| `--side-w` | polish.css: `252px` → polish.css: `232px` |
| `--spring` | motion.css: `cubic-bezier(.34, 1.56, .64, 1)` |
| `--text` | experience.css: `#e0e3ed` → experience.css `[data-theme=contrast]`: `#fff` → polish.css `:not([data-theme=midnight]):not([data-th`: `#dbdce0` → style.css: `#dbdee1` |
| `--text-muted` | experience.css: `#a5adbe` → experience.css `[data-theme=contrast]`: `#c4c4c4` → polish.css `:not([data-theme=midnight]):not([data-th`: `#8d8f98` → style.css: `#949ba4` |
| `--text-strong` | polish.css `:not([data-theme=midnight]):not([data-th`: `#f3f3f5` → style.css: `#f2f3f5` |
| `--yellow` | style.css: `#f0b232` |

## Cores fora dos tokens

222 cores literais distintas, 695 ocorrências fora das definições de token. As 40 mais usadas:

| Cor | Usos | Arquivos |
|---|---|---|
| `#fff` | 215 | admin.css, call-stage.css, call-tools.css, changelog.css, chat-media.css, clips.css… |
| `#000` | 39 | call-stage.css, call-tools.css, controls.css, dm-call.css, experience.css, mobile-stream.css… |
| `rgba(0,0,0,.35)` | 22 | call-tools.css, changelog.css, clips.css, controls.css, desktop.css, motion.css… |
| `rgba(0,0,0,.55)` | 16 | call-stage.css, chat-media.css, landing.css, mudae-salao.css, music.css, profile-media.css… |
| `rgba(0,0,0,.45)` | 16 | call-tools.css, chat-media.css, controls.css, download.css, landing.css, mudae-salao.css… |
| `rgba(0,0,0,.6)` | 15 | changelog.css, chat-media.css, clips.css, controls.css, download.css, gif-picker.css… |
| `rgba(0,0,0,.5)` | 11 | chat-media.css, clips.css, controls.css, emoji-picker.css, gif-picker.css, motion.css… |
| `rgba(0,0,0,.25)` | 9 | call-stage.css, controls.css, desktop.css, download.css, friends.css |
| `#80848e` | 8 | admin.css, presence.css, profile.css, style.css |
| `rgba(255,255,255,.08)` | 8 | chat-media.css, landing.css, mudae-salao.css, music.css, stream-zoom.css |
| `#6d4527` | 8 | landing.css |
| `rgb(000/.6)` | 7 | call-stage.css, profile-media.css, profile.css |
| `rgba(255,255,255,.06)` | 7 | chat-media.css, music.css, profile-media.css, profile.css, stream-zoom.css |
| `#f0b232` | 6 | download.css, profile-media.css |
| `#0008` | 5 | admin.css, channel-navigation.css, experience.css, profile-media.css |
| `#4e5058` | 5 | call-stage.css, style.css |
| `rgba(0,0,0,.65)` | 5 | chat-media.css, mudae-salao.css, style.css |
| `rgba(255,255,255,.07)` | 5 | controls.css, landing.css, motion.css, mudae-salao.css, profile.css |
| `rgba(0,0,0,.2)` | 5 | download.css, mudae-salao.css, music.css, style.css |
| `#1e1f22` | 5 | landing.css, style.css |
| `rgba(0,0,0,.3)` | 4 | clips.css, landing.css, profile-media.css |
| `rgba(0,0,0,.72)` | 4 | clips.css, mobile-stream.css, mudae-salao.css |
| `rgba(255,255,255,.25)` | 4 | controls.css, server-navigation.css |
| `rgba(255,255,255,.14)` | 4 | controls.css, stream-zoom.css |
| `rgb(000/.45)` | 4 | profile-media.css, profile.css |
| `rgba(255,255,255,.18)` | 3 | call-stage.css, chat-media.css, music.css |
| `rgba(255,255,255,.04)` | 3 | clips.css, controls.css, server-navigation.css |
| `#0d0b12` | 3 | clips.css |
| `rgba(255,255,255,.6)` | 3 | clips.css, profile-media.css, style.css |
| `rgba(6,6,8,.72)` | 3 | controls.css, server-navigation.css |
| `rgba(0,0,0,.4)` | 3 | desktop.css, overlay.css, stream-zoom.css |
| `rgba(255,255,255,.12)` | 3 | download.css, profile.css |
| `rgba(0,0,0,0)` | 3 | download.css, mobile-stream.css |
| `rgba(255,255,255,.1)` | 3 | experience.css, music.css, polish.css |
| `#5865f2` | 3 | experience.css, style.css |
| `rgba(10,10,12,.4)` | 3 | landing.css |
| `rgba(240,86,94,.12)` | 3 | polish.css, profile.css |
| `rgba(240,178,50,.1)` | 3 | profile.css, style.css |
| `#2b2d31` | 3 | style.css |
| `#0002` | 2 | admin.css, experience.css |

Restos da paleta do Discord ainda escritos à mão (não seguem o tema): `#5865f2` (3×), `#80848e` (8×), `#4e5058` (5×), `#1e1f22` (5×), `#2b2d31` (3×), `#313338` (2×), `#35373c` (1×), `#41434a` (1×), `#6d6f78` (2×), `#dbdee1` (1×).

## Tipografia

49 valores de `font-size` diferentes. Frações de pixel (11,5 · 12,5 · 13,5 · 14,5 · 15,5 px) e tamanhos abaixo de 11 px aparecem em vários arquivos.

`12px` ×152 · `14px` ×143 · `13px` ×111 · `11px` ×47 · `15px` ×46 · `16px` ×25 · `10px` ×22 · `18px` ×18 · `20px` ×17 · `12.5px` ×14 · `24px` ×13 · `22px` ×10 · `13.5px` ×10 · `17px` ×9 · `14.5px` ×9 · `9px` ×8 · `30px` ×8 · `26px` ×7 · `11.5px` ×7 · `21px` ×5 · `28px` ×5 · `8px` ×4 · `var(--chat-size)` ×4 · `19px` ×3 · `0` ×2 · `12px !important` ×2 · `34px` ×2 · `15px !important` ×2 · `9.5px` ×2 · `10.5px` ×2 · `23px` ×2 · `32px` ×2 · `15.5px` ×2 · `calc(var(--av) * .38)` ×1 · `38px` ×1 · `clamp(32px, 5.2vw, 52px)` ×1 · `clamp(30px, 4.4vw, 40px)` ×1 · `25px` ×1 · `clamp(34px, 4.3vw, 58px)` ×1 · `clamp(26px, 2.9vw, 38px)` ×1 · `clamp(28px, 4.2vw, 52px)` ×1 · `48px` ×1 · `clamp(12px, 7.6cqi, 17px)` ×1 · `clamp(10px, 6.5cqi, 13px)` ×1 · `clamp(11px, 7.5cqi, 15px)` ×1 · `64px` ×1 · `inherit` ×1 · `44px` ×1 · `85%` ×1

## Raios

47 valores de `border-radius` diferentes:

`8px` ×101 · `50%` ×88 · `6px` ×62 · `10px` ×59 · `12px` ×57 · `999px` ×39 · `4px` ×39 · `14px` ×25 · `9px` ×15 · `16px` ×15 · `0` ×14 · `5px` ×13 · `2px` ×11 · `inherit` ×9 · `7px` ×8 · `18px` ×8 · `3px` ×6 · `20px` ×5 · `0 4px 4px 0` ×4 · `1px` ×3 · `0 0 16px 16px` ×2 · `16px 16px 0 0` ×2 · `15px` ×2 · `28px` ×2 · `22px` ×2 · `13px` ×2 · `32px` ×2 · `24px` ×2 · `10px 10px 0 0` ×2 · `8px 0 0 8px` ×2 · `0 8px 8px 0` ×2 · `8px 8px 0 0` ×2 · `0 0 8px 8px` ×2 · `0 0 12px 12px` ×1 · `0 0 17px 17px` ×1 · `10px !important` ×1 · `14px !important` ×1 · `11px` ×1 · `50% 50% 0 0` ×1 · `calc(var(--art-r) + 1px)` ×1 · `var(--art-r)` ×1 · `0 0 var(--art-r) var(--art-r)` ×1 · `4px 14px 14px 14px` ×1 · `12px 12px 0 0` ×1 · `26px` ×1 · `4px 0 0 4px` ×1 · `50% !important` ×1

## Sombras

178 valores de `box-shadow` diferentes (as 15 mais usadas):

- ×26 `none`
- ×11 `inset 0 0 0 1px var(--divider)`
- ×9 `var(--shadow-float)`
- ×7 `0 0 0 2px var(--brand)`
- ×4 `var(--shadow-header)`
- ×3 `inset 0 0 0 1px var(--brand)`
- ×3 `0 0 0 2px #fff, 0 0 0 5px color-mix(in srgb, var(--brand) 45%, transparent)`
- ×3 `0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)`
- ×3 `0 0 0 3px color-mix(in srgb, var(--brand) 25%, transparent)`
- ×3 `0 12px 32px rgba(0, 0, 0, .5)`
- ×3 `inset 0 0 0 2px transparent`
- ×3 `inset 0 0 0 2px var(--brand)`
- ×2 `0 4px 14px color-mix(in srgb, var(--brand) 22%, transparent)`
- ×2 `0 6px 20px #0002`
- ×2 `0 16px 48px #0008`

## Ícones (`icons.js`)

86 ícones, todos em traço de 2 px num quadro de 24×24 (base Lucide, ISC). "Usos" conta `Icon('nome')`, `data-icon="nome"` e nomes passados a menus. "Anima" diz se algum CSS anima o ícone ao passar o mouse ou trocar de estado.

| Ícone | Usos | Anima | Observação |
|---|---|---|---|
| `menu` | 9 | — | |
| `hash` | 20 | — | |
| `volume` | 24 | — | |
| `volumeX` | 11 | sim | |
| `lock` | 15 | — | |
| `mic` | 9 | sim | |
| `micOff` | 15 | sim | |
| `headphones` | 9 | sim | |
| `headphonesOff` | 11 | sim | |
| `settings` | 21 | sim | |
| `screen` | 62 | — | |
| `screenShare` | 6 | sim | |
| `camera` | 29 | sim | |
| `cameraOff` | 3 | sim | |
| `phone` | 17 | — | |
| `plus` | 14 | — | |
| `upload` | 6 | — | |
| `plusCircle` | 4 | — | |
| `gif` | 1 | — | |
| `smile` | 2 | — | |
| `smilePlus` | 3 | — | |
| `reply` | 2 | — | |
| `send` | 1 | — | |
| `pencil` | 16 | — | |
| `trash` | 17 | — | |
| `users` | 14 | sim | |
| `chevronDown` | 16 | — | |
| `chevronRight` | 4 | — | |
| `chevronLeft` | 2 | — | |
| `logout` | 3 | sim | |
| `alert` | 6 | — | |
| `info` | 61 | — | |
| `copy` | 2 | — | |
| `x` | 32 | — | |
| `crown` | 8 | — | |
| `file` | 6 | — | |
| `music` | 7 | sim | |
| `download` | 8 | — | |
| `signal` | 8 | — | |
| `link` | 4 | — | |
| `userCog` | 3 | — | |
| `pause` | 9 | — | |
| `play` | 13 | sim | |
| `clapperboard` | 5 | sim | |
| `pauseBars` | 5 | — | |
| `skip` | 6 | — | |
| `stop` | 9 | sim | |
| `disc` | 7 | sim | |
| `listMusic` | 5 | — | |
| `refresh` | 5 | — | |
| `waves` | 4 | sim | |
| `pin` | 4 | — | |
| `pinOff` | 4 | — | |
| `maximize` | 5 | — | |
| `minimize` | 2 | — | |
| `pip` | 6 | — | |
| `eye` | 6 | — | |
| `eyeOff` | 2 | — | |
| `sparkles` | 5 | — | |
| `moreHorizontal` | 1 | — | |
| `message` | 16 | — | |
| `check` | 10 | — | |
| `userPlus` | 6 | — | |
| `userMinus` | 1 | — | |
| `ban` | 4 | — | |
| `search` | 12 | — | |
| `zoomIn` | 3 | — | |
| `zoomOut` | 2 | — | |
| `crop` | 3 | — | |
| `image` | 1 | — | |
| `panelTop` | 1 | — | |
| `layers` | 2 | — | |
| `scan` | 2 | — | |
| `shrink` | 1 | — | |
| `heart` | 5 | — | |
| `dice` | 10 | — | |
| `gem` | 1 | — | |
| `at` | 4 | — | |
| `clock` | 1 | — | |
| `activity` | 2 | — | |
| `star` | 1 | — | |
| `gamepad` | 5 | — | |
| `grid` | 0 | — | |
| `externalLink` | 1 | — | |
| `store` | 3 | — | |
| `shieldAlert` | 0 | — | |

## Animações (`animation`)

Todas respeitam "Reduzir animações" e `prefers-reduced-motion` pela regra global do `experience.css` (`animation: none !important`), exceto as feitas em JavaScript (Web Animations API), listadas no fim.

| Arquivo:linha | Seletor | Keyframes | Declaração | Infinita | Propriedades | Só compositor |
|---|---|---|---|---|---|---|
| admin.css:181 | `.admin-savebar` | savebar-in | `savebar-in .2s ease-out` | não | transform, opacity | sim |
| admin.css:186 | `.admin-savebar.shake` | savebar-shake | `savebar-shake .45s` | não | transform | sim |
| call-stage.css:82 | `.watch-spinner` | lb-spin | `lb-spin .8s linear infinite` | **sim** | transform | sim |
| call-stage.css:112 | `.tb` | tb-in | `tb-in .18s ease-out` | não | opacity, transform | sim |
| call-stage.css:137 | `.speak-bars i` | speak-bar | `speak-bar .9s ease-in-out infinite` | **sim** | transform | sim |
| call-stage.css:150 | `.campv-card` | pop | `pop .15s ease-out` | não | opacity, transform | sim |
| call-stage.css:164 | `.campv-spinner` | lb-spin | `lb-spin .8s linear infinite` | **sim** | transform | sim |
| call-tools.css:65 | `#stage-alone` | sa-in | `sa-in .35s var(--spring, ease) both` | não | opacity, transform | sim |
| chat-media.css:5 | `.embed` | embed-in | `embed-in .22s var(--ease-out, ease-out)` | não | opacity, transform | sim |
| chat-media.css:103 | `.lb-spinner` | lb-spin | `lb-spin .8s linear infinite` | **sim** | transform | sim |
| clips.css:4 | `#stage-controls .sc-btn.clipping .clap, .clip-badge .clap` | clap | `clap .7s ease-in-out` | não | transform | sim |
| clips.css:153 | `.clip-notice` | clip-in | `clip-in .28s var(--ease-enter)` | não | opacity, transform | sim |
| clips.css:158 | `.clip-notice.leaving` | clip-out | `clip-out .2s ease-in forwards` | não | opacity, transform | sim |
| controls.css:192 | `.auth-card` | dialog-in | `dialog-in var(--motion-large) var(--ease-enter)` | não | opacity, transform | sim |
| desktop.css:7 | `.download-app:hover .rail-icon .ico` | download-nudge | `download-nudge .7s ease-in-out infinite` | **sim** | transform | sim |
| desktop.css:41 | `.share-source` | share-in | `share-in .22s ease-out backwards` | não | opacity, transform | sim |
| dm-call.css:42 | `.incoming-call .ic-pulse, .tile.dm-pending.ringing .ic-pulse` | call-pulse | `call-pulse 1.6s ease-out infinite` | **sim** | box-shadow | **não** |
| dm-call.css:46 | `.incoming-call` | incoming-in | `incoming-in var(--motion-slow) var(--ease-enter)` | não | opacity, transform | sim |
| dm-call.css:82 | `.dm-call-banner.ringing .dcb-icon` | ring-shake | `ring-shake 1.3s ease-in-out infinite` | **sim** | transform | sim |
| dm-call.css:112 | `.dm-call-flag.ringing` | ring-shake | `ring-shake 1.3s ease-in-out infinite` | **sim** | transform | sim |
| download.css:66 | `.dl-button:hover .dl-button-icon .ico` | dl-nudge | `dl-nudge .7s ease-in-out infinite` | **sim** | transform | sim |
| download.css:108 | `.dl-ss-link::after, .dl-ss-button::after` | dl-pulse | `dl-pulse 1.8s ease-in-out infinite` | **sim** | opacity, transform | sim |
| download.css:126 | `.dl-ad-settings::after, .dl-ad-switch::after` | dl-pulse | `dl-pulse 1.8s ease-in-out infinite` | **sim** | opacity, transform | sim |
| experience.css:154 | `.keybind-wait` | keybind-blink | `keybind-blink 1.2s ease-in-out infinite` | **sim** | opacity | sim |
| friends.css:67 | `.friends-empty-icon` | float | `float 4.5s ease-in-out infinite` | **sim** | transform | sim |
| landing.css:90 | `.ld-btn-light:hover .ico` | ld-nudge | `ld-nudge .7s ease-in-out infinite` | **sim** | transform | sim |
| landing.css:101 | `.ld-preview` | ld-rise | `ld-rise .8s var(--ease-enter) .1s both` | não | opacity, transform | sim |
| landing.css:139 | `.ld-av.speaking, .ld-tile.speaking` | ld-speak | `ld-speak 2.4s ease-in-out infinite` | **sim** | box-shadow | **não** |
| landing.css:155 | `.ld-msg-new` | ld-msg-in | `ld-msg-in .5s var(--ease-enter) 1.4s both` | não | opacity, transform | sim |
| landing.css:156 | `.ld-msg-live` | ld-msg-in | `ld-msg-in .45s var(--ease-enter) both` | não | opacity, transform | sim |
| landing.css:157 | `.ld-react.pop` | ld-react-pop | `ld-react-pop .4s cubic-bezier(.3, 1.6, .5, 1) both` | não | opacity, scale | sim |
| landing.css:161 | `.ld-w-typing i` | ld-dot | `ld-dot 1.2s ease-in-out infinite` | **sim** | opacity, transform | sim |
| landing.css:167 | `.ld-float` | ld-pop | `ld-pop .5s var(--ease-enter) .8s both` | não | opacity, transform | sim |
| landing.css:228 | `.ld-tile.speaking` | ld-speak-tile | `ld-speak-tile` | não | box-shadow | **não** |
| landing.css:249 | `.ld-game-cloud` | ld-cloud | `ld-cloud 14s ease-in-out infinite alternate` | **sim** | transform | sim |
| landing.css:260 | `.ld-game-player` | ld-hop | `ld-hop 2.6s ease-in-out infinite` | **sim** | transform | sim |
| landing.css:263 | `.ld-game-coin` | ld-coin | `ld-coin 1.4s ease-in-out infinite` | **sim** | transform | sim |
| landing.css:327 | `.ld-pad.playing::after` | ld-pad-progress | `ld-pad-progress var(--dur, 1s) linear both` | não | transform | sim |
| landing.css:332 | `.ld-burst` | ld-burst | `ld-burst .9s cubic-bezier(.2, .7, .4, 1) forwards` | não | opacity, transform | sim |
| mobile-stream.css:32 | `.imm-hint` | imm-hint | `imm-hint 3.2s ease forwards` | não | opacity, transform | sim |
| motion.css:43 | `:is(.icon-btn, .sc-btn):hover:not(:disabled) .ico-clapperboard .clap` | clap | `clap .7s ease-in-out` | não | transform | sim |
| motion.css:54 | `:is(.icon-btn, .sc-btn):hover:not(:disabled) :is(.ico-mic, .ico-micOff` | mic-sway | `mic-sway .62s cubic-bezier(.36, .07, .19, .97)` | não | transform | sim |
| motion.css:56 | `:is(.icon-btn, .sc-btn):hover:not(:disabled) :is(.ico-mic, .ico-micOff` | mic-capsule | `mic-capsule .62s ease-out` | não | transform | sim |
| motion.css:60 | `:is(.icon-btn, .sc-btn):hover:not(:disabled) :is(.ico-headphones, .ico` | headset-bob | `headset-bob .55s var(--spring)` | não | transform | sim |
| motion.css:68 | `.ico-swap` | ico-pop | `ico-pop .38s var(--spring)` | não | transform, opacity | sim |
| motion.css:70 | `.ico-swap .slash` | slash-draw | `slash-draw .32s .06s ease-out backwards` | não | stroke-dashoffset | **não** |
| motion.css:74 | `:is(.icon-btn, .sc-btn).hangup:hover .ico` | hangup-ring | `hangup-ring .5s ease-in-out` | não | transform | sim |
| motion.css:78 | `:is(.vp-btn, .sc-btn):hover:not(:disabled) :is(.ico-camera, .ico-camer` | cam-flash | `cam-flash .5s var(--spring)` | não | transform | sim |
| motion.css:82 | `:is(.vp-btn, .sc-btn):hover:not(:disabled) .ico-screenShare .arrow` | arrow-loop | `arrow-loop .6s ease-in-out` | não | transform, opacity | sim |
| motion.css:90 | `:is(.icon-btn, .sc-btn):hover .ico-waves .bar` | eq | `eq .5s ease-in-out infinite alternate` | **sim** | transform | sim |
| motion.css:97 | `.sc-btn:hover:not(:disabled) :is(.ico-music, .ico-volumeX)` | notes-dance | `notes-dance .6s var(--spring)` | não | transform | sim |
| motion.css:101 | `#btn-members:hover .ico-users` | headset-bob | `headset-bob .5s var(--spring)` | não | transform | sim |
| motion.css:104 | `#chat-form #btn-emoji:hover:not(:disabled) .ico` | emoji-wink | `emoji-wink .5s var(--spring)` | não | transform | sim |
| motion.css:132 | `.avatar.speaking` | speak-glow | `speak-glow 1.6s ease-in-out infinite` | **sim** | box-shadow | **não** |
| motion.css:137 | `.tile.speaking .avatar` | speak-glow | `speak-glow 1.6s ease-in-out infinite` | **sim** | box-shadow | **não** |
| motion.css:141 | `:is(#context-menu, #context-submenu, #profile-card, #emoji-picker, #gi` | menu-in | `menu-in var(--motion-base) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:144 | `#context-menu.sheet-menu` | sheet-up | `sheet-up var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| motion.css:145 | `.msg-new` | rise-in | `rise-in var(--motion-slow) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:146 | `.msg:hover .msg-actions` | bar-in | `bar-in var(--motion-fast) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:148 | `#tooltip` | tip-in | `tip-in var(--motion-fast) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:149 | `#tooltip.right` | tip-in-right | `tip-in-right` | não | opacity, transform | sim |
| motion.css:154 | `:is(.confirm-overlay, #server-dialog, #create-channel, #changelog, #fe` | fade-in | `fade-in var(--motion-base) var(--ease-enter)` | não | opacity | sim |
| motion.css:155 | `:is(.confirm-card, .channel-dialog, #create-channel .card, #feedback .` | dialog-in | `dialog-in var(--motion-slow) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:156 | `:is(#changelog .cl-card, .settings-overlay .settings-shell)` | dialog-in | `dialog-in var(--motion-large) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:157 | `.channel-dialog[open]::backdrop` | fade-in | `fade-in var(--motion-base) var(--ease-enter)` | não | opacity | sim |
| motion.css:177 | `:is(.confirm-overlay, #server-dialog, #msg-sheet).leaving` | fade-out | `fade-out var(--motion-exit) var(--ease-exit) forwards` | não | opacity | sim |
| motion.css:178 | `#context-menu.leaving` | menu-out | `menu-out var(--motion-exit) var(--ease-exit) forwards` | não | opacity, transform | sim |
| motion.css:180 | `#context-menu.sheet-menu.leaving` | sheet-menu-out | `sheet-menu-out` | não | opacity, transform | sim |
| motion.css:181 | `:is(.confirm-overlay, #server-dialog).leaving > *` | dialog-out | `dialog-out var(--motion-exit) var(--ease-exit) forwards` | não | opacity, transform | sim |
| motion.css:182 | `#msg-sheet .sheet-panel` | sheet-up | `sheet-up var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| motion.css:183 | `#msg-sheet.leaving .sheet-panel` | sheet-down | `sheet-down var(--motion-exit) var(--ease-exit) forwards` | não | transform | sim |
| motion.css:195 | `#app` | fade-in | `fade-in var(--motion-slow) var(--ease-enter)` | não | opacity | sim |
| motion.css:196 | `:is(#messages, #friends-view)` | rise-in | `rise-in var(--motion-slow) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:197 | `:is(#voice-view, #salon-view)` | fade-in | `fade-in var(--motion-slow) var(--ease-enter)` | não | opacity | sim |
| motion.css:198 | `:is(#settings, #server-settings) .settings-content section:not(.hidden` | rise-in | `rise-in var(--motion-slow) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:204 | `#app.members-open #members` @media (max-width: 1100px) | drawer-right | `drawer-right var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| motion.css:208 | `#main:is(.voice-chat, .salon-mode.salon-side-open) > #chat-view` @media (max-width: 1000px) | drawer-right | `drawer-right var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| motion.css:212 | `#app.channels-open :is(#sidebar, #dock)` @media (max-width: 640px) | drawer-left | `drawer-left var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| motion.css:216 | `#toast` | toast-in | `toast-in var(--motion-slow) var(--ease-enter)` | não | opacity, transform | sim |
| motion.css:234 | `#conn-banner` | banner-in | `banner-in var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| mudae-salao.css:219 | `.salon-card.framed.r-legendary .salon-card-visual::before` | salon-sheen | `salon-sheen 7s linear infinite` | **sim** | --sheen | **não** |
| mudae-salao.css:280 | `.salon-showcase.has-art .salon-showcase-portrait` | salon-backdrop-reveal | `salon-backdrop-reveal .32s ease-out` | não | opacity | sim |
| mudae-salao.css:316 | `.salon-card.revealing` | salon-reveal | `salon-reveal .6s cubic-bezier(.2, 1.35, .4, 1)` | não | transform, opacity | sim |
| mudae-salao.css:334 | `.salon-reel.is-preparing .salon-card-back svg` | salon-shuffle | `salon-shuffle .5s ease-in-out infinite alternate` | **sim** | transform | sim |
| mudae-salao.css:337 | `.salon-reel.tease` | salon-tease | `salon-tease .35s ease-in-out infinite alternate` | **sim** | box-shadow | **não** |
| mudae-salao.css:348 | `#salon-view.flash::after` | salon-flash | `salon-flash 1.3s ease-out forwards` | não | opacity | sim |
| mudae-salao.css:371 | `.salon-claim.primary:hover:not(:disabled) .salon-heart svg` | mudae-beat | `mudae-beat .9s ease-in-out infinite` | **sim** | transform | sim |
| mudae-salao.css:375 | `.salon-ring circle.left` | salon-ring | `salon-ring linear forwards` | não | stroke-dashoffset | **não** |
| mudae-salao.css:394 | `.salon-float` | salon-float | `salon-float 2.4s cubic-bezier(.2, .7, .3, 1) forwards` | não | transform, opacity | sim |
| mudae-salao.css:453 | `.salon-card.live.p-open, .salon-card.live.p-priority` | salon-open | `salon-open 1.6s ease-in-out infinite alternate` | **sim** | box-shadow | **não** |
| mudae-salao.css:456 | `.salon-card.back .salon-card-back` | salon-wobble | `salon-wobble .5s ease-in-out infinite alternate` | **sim** | filter | **não** |
| mudae-salao.css:458 | `.salon-card.arriving` | salon-arrive | `salon-arrive .7s cubic-bezier(.2, 1.2, .4, 1)` | não | transform, opacity | sim |
| mudae-salao.css:549 | `.mudae-roll-line.hold .mudae-roll-thumb, .mudae-roll-line.hold .mudae-` | mudae-hold | `mudae-hold var(--hold) step-end` | não | visibility | **não** |
| mudae-salao.css:550 | `.mudae-roll-line.hold .mudae-roll-spin` | mudae-hold-show | `mudae-hold-show var(--hold) step-end` | não | visibility | **não** |
| mudae.css:60 | `.mudae-claim:hover:not(:disabled) .mudae-heart svg` | mudae-beat | `mudae-beat .9s ease-in-out infinite` | **sim** | transform | sim |
| mudae.css:63 | `.mudae-drain` | mudae-drain | `mudae-drain` | não | transform | sim |
| mudae.css:77 | `.msg-new .mudae-line.married` | mudae-pop | `mudae-pop .5s cubic-bezier(.2, 1.4, .4, 1)` | não | transform, opacity | sim |
| music.css:54 | `.tile.dj.focus .dj-stage` | dj-stage-in | `dj-stage-in .28s var(--ease-out, ease-out)` | não | opacity | sim |
| music.css:69 | `.tile.dj:not(.paused) .dj-stage-badge .ico` | dj-spin | `dj-spin 2.4s linear infinite` | **sim** | transform | sim |
| music.css:86 | `.dj-eq i` | dj-eq | `dj-eq 1s ease-in-out infinite` | **sim** | transform | sim |
| music.css:161 | `.sc-btn#sc-music.active .ico-disc` | dj-spin | `dj-spin 2.4s linear infinite` | **sim** | transform | sim |
| music.css:162 | `.sc-btn#sc-music:hover:not(:disabled) .ico-disc` | dj-spin | `dj-spin .9s linear infinite` | **sim** | transform | sim |
| music.css:186 | `.dj-avatar.spinning .ico` | dj-spin | `dj-spin 2.4s linear infinite` | **sim** | transform | sim |
| music.css:196 | `#dj-panel` | menu-in | `menu-in .16s var(--ease-out, ease-out)` | não | opacity, transform | sim |
| overlay.css:28 | `.ov-user` | ov-in | `ov-in .16s ease-out` | não | opacity, transform | sim |
| profile-media.css:235 | `#page-profile .profile-live-dot` | profile-live | `profile-live 2s ease-out infinite` | **sim** | box-shadow | **não** |
| server-navigation.css:42 | `.dialog-hero` | hero-in | `hero-in var(--motion-large) var(--ease-enter) both` | não | opacity, transform | sim |
| server-navigation.css:82 | `.server-dialog .btn-danger:not(:disabled)` | armed | `armed var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| server-navigation.css:119 | `.welcome-step` | welcome-in | `welcome-in var(--motion-large) var(--ease-enter) both` | não | opacity, transform | sim |
| server-navigation.css:133 | `.server-choice:hover .choice-icon .ico` | choice-pop | `choice-pop var(--motion-large) var(--ease-enter)` | não | transform | sim |
| server-navigation.css:156 | `.server-dialog .invite-copy.copied` | armed | `armed var(--motion-slow) var(--ease-enter)` | não | transform | sim |
| server-navigation.css:165 | `.invite-identity .rail-icon` | hero-in | `hero-in var(--motion-large) var(--ease-enter) both` | não | opacity, transform | sim |
| stream-zoom.css:42 | `.tile.sz-zoomed .sz-mini` | sz-in | `sz-in .2s var(--ease-out, ease-out)` | não | opacity, transform | sim |
| stream-zoom.css:58 | `.sz-hint` | sz-hint | `sz-hint 4.2s ease forwards` | não | opacity, transform | sim |
| style.css:284 | `.call-clock-dot` | call-clock-pulse | `call-clock-pulse 2s ease-out infinite` | **sim** | box-shadow | **não** |
| style.css:316 | `.msg.flash` | flash | `flash 1.6s ease-out` | não | background | **não** |
| style.css:541 | `.card` | pop | `pop var(--motion-base) var(--ease-enter)` | não | opacity, transform | sim |
| voice-message.css:5 | `#voice-rec` | voice-rec-in | `voice-rec-in var(--motion-base) var(--ease-enter)` | não | opacity, transform | sim |
| voice-message.css:23 | `.voice-rec-dot` | voice-rec-blink | `voice-rec-blink 1.2s ease-in-out infinite` | **sim** | opacity | sim |

Total: 119 declarações de animação, 37 infinitas, 16 que animam algo além de transform/opacity.

Animações em JavaScript: `confetti.js` (respeita as duas preferências), `mudae-salao.js` (roleta via `element.animate`, só confere a preferência do sistema, não o "Reduzir animações" do app), `stream-zoom.js` e `mobile-stream.js` (zoom com rAF; o zoom confere as duas preferências), `music.js` (posição do player com rAF), `clip-ui.js` e `sound-trimmer.js` (cursor de reprodução com rAF).

## Transições (`transition`)

Propriedades transicionadas (número de declarações): `background` 112 · `transform` 98 · `color` 60 · `box-shadow` 41 · `opacity` 39 · `border-color` 29 · `display` 6 · `background-color` 4 · `filter` 3 · `overlay` 3 · `border-radius` 3 · `background-image` 1 · `text-decoration-color` 1 · `outline-color` 1 · `height` 1.

165 declarações transicionam algo além de transform/opacity (repintura a cada quadro da transição):

- admin.css:35 `#server-settings .btn-primary, #server-settings .admin-conte` → background, box-shadow
- admin.css:39 `#server-settings .admin-content .btn-secondary` → background
- admin.css:41 `#server-settings .admin-content .btn-danger-outline` → background, color
- admin.css:45 `#server-settings .admin-content .btn-ghost` → background, color
- admin.css:50 `#server-settings .icon-btn` → background, color
- admin.css:57 `.ds-switch` → background
- admin.css:72 `.admin-row` → background
- admin.css:101 `#server-settings .admin-content .admin-callout` → background
- call-tools.css:5 `.sc-caret` → background
- call-tools.css:76 `.sa-btn` → background
- call-tools.css:154 `.vfx-chip` → background, border-color, color
- call-tools.css:178 `.vfx-card` → border-color, background
- changelog.css:8 `.cl-close` → background
- changelog.css:14 `.cl-version` → background, color
- chat-media.css:34 `.embed-play` → background
- chat-media.css:43 `.embed-remove` → color
- chat-media.css:61 `.att-tile img` → filter
- chat-media.css:84 `.lb-btn` → background, color
- chat-media.css:117 `.lb-thumb` → border-color
- clips.css:30 `.clip-close` → background, color
- clips.css:38 `.clip-tab` → background, color, box-shadow
- clips.css:80 `.clip-wave input.clip-handle[type=range]::-webkit-slider-thu` → box-shadow
- clips.css:117 `.clip-item` → border-color, box-shadow
- clips.css:139 `.clip-privacy` → border-color
- clips.css:165 `.clip-download` → background
- controls.css:5 `input[type=checkbox]:not(:is(.ds-switch, .setting-switch inp` → background-color, border-color, box-shadow
- controls.css:19 `:is(.ds-switch, .setting-switch input[type=checkbox], .setti` → background-color
- controls.css:24 `:is(.ds-switch, .setting-switch input[type=checkbox], .setti` → background-image
- controls.css:52 `:is(.card, body) input[type=radio]` → border-color
- controls.css:70 `input[type=range]::-webkit-slider-thumb` → box-shadow
- controls.css:96 `:is(.settings-content, .card, #server-settings, .channel-dia` → border-color, box-shadow
- controls.css:101 `.settings-content :is(input:not([type=checkbox]):not([type=r` → border-color, box-shadow
- controls.css:113 `#settings .settings-content button` → background, color, box-shadow
- controls.css:121 `:is(.settings-content, .auth-card, .card) input[type=color]:` → border-color, box-shadow
- controls.css:141 `#create-channel .card button.close` → background, color
- controls.css:145 `#create-channel .card .type-option` → background, border-color, box-shadow
- controls.css:153 `#create-channel .type-icon` → background, color
- controls.css:157 `#create-channel .chips .chip.selectable` → background, border-color
- controls.css:162 `:is(#create-channel .buttons, .confirm-actions) button` → background, color, box-shadow
- controls.css:210 `.auth-card input:not([type=color])` → border-color, box-shadow, background
- controls.css:216 `.auth-card .btn-primary` → background
- desktop.css:17 `.share-close` → background, color
- desktop.css:26 `.share-tabs button` → background, color
- desktop.css:41 `.share-source` → background, box-shadow
- desktop.css:90 `.share-chip` → color, background
- desktop.css:95 `.share-chip-label .ico` → color
- desktop.css:97 `.share-chip-spec` → color
- desktop.css:108 `.share-audio-select` → background-color
- desktop.css:146 `.share-follow-icon` → color
- desktop.css:206 `#settings .settings-content .overlay-segmented button` → color
- desktop.css:245 `.overlay-puck` → box-shadow, background
- dm-call.css:33 `.tile.dm-pending .avatar` → filter
- dm-call.css:59 `.ic-btn` → background, box-shadow
- download.css:20 `.dl-open` → color
- download.css:58 `.dl-button` → background, box-shadow
- download.css:70 `.dl-alt` → color, text-decoration-color
- download.css:141 `.dl-dialog::backdrop` → background
- download.css:149 `.dl-dialog-close` → background, color
- download.css:169 `.dl-dialog-btn` → background, color
- download.css:184 `.dl-features article` → background
- emoji-picker.css:26 `.ep-tab` → background, color
- emoji-picker.css:32 `.ep-tab-glyph` → filter
- emoji-picker.css:74 `.emoji-dropzone` → background, border-color
- experience.css:141 `.keybind-row` → background
- experience.css:144 `#settings #keybind-list button.keybind-key` → border-color, background
- experience.css:156 `#settings #keybind-list button.keybind-undo` → color, background
- friends.css:44 `.friends-search input` → border-color, box-shadow
- friends.css:80 `.friends-add-box` → border-color, box-shadow
- gif-picker.css:30 `.gif-item::after` → box-shadow
- landing.css:34 `.auth-back` → color, background
- landing.css:57 `.ld-login` → background, box-shadow
- landing.css:83 `.ld-btn` → color, background, box-shadow
- landing.css:308 `.ld-footer nav a` → color
- landing.css:315 `.ld-pad` → background, color
- mobile-stream.css:22 `.imm-btn` → background
- motion.css:112 `#emoji-picker .ep-emoji` → background
- motion.css:116 `.icon-btn, .vp-btn, .friend-btn, .pc-btn, .pc-icon-btn, .ft-` → background, color, box-shadow
- motion.css:121 `.sc-btn` → background, color, box-shadow
- motion.css:127 `.rail-icon` → border-radius, background, color
- motion.css:134 `.tile` → box-shadow
- motion.css:238 `.channel, .member, .voice-user, .friend-row, .admin-row` → background, color
- mudae-salao.css:34 `.salon-side-tab` → color
- mudae-salao.css:47 `.salon-person` → background
- mudae-salao.css:65 `.salon-tab` → color
- mudae-salao.css:73 `.salon-simple, .salon-open-btn` → background, color
- mudae-salao.css:90 `.salon-card` → box-shadow
- mudae-salao.css:322 `.salon-reel` → box-shadow
- mudae-salao.css:358 `.salon-claim` → background
- mudae-salao.css:387 `.salon-react` → background
- mudae-salao.css:409 `.salon-source` → background, color, border-color
- mudae-salao.css:416 `.salon-roll` → background
- mudae-salao.css:485 `.salon-filter` → background, border-color
- mudae-salao.css:502 `.salon-card-actions button` → background, color
- mudae-salao.css:523 `.salon-rank-row` → background
- mudae-salao.css:542 `.mudae-roll-line` → background
- mudae.css:48 `.mudae-claim` → background
- mudae.css:57 `.mudae-heart` → color
- mudae.css:92 `.mudae-pager button` → background, color
- music.css:5 `#dj-player` → border-radius
- music.css:80 `.dj-stage .tc-btn` → background
- music.css:104 `.dj-next-list li` → background
- music.css:114 `.dj-next-more` → background
- music.css:209 `.dj-search` → box-shadow
- music.css:232 `.dj-track` → background
- music.css:245 `.dj-add` → background
- music.css:265 `.dj-ctl` → background
- overlay.css:33 `.ov-avatar` → box-shadow
- overlay.css:43 `.ov-label` → background, color
- polish.css:68 `#voice-room-name` → color
- polish.css:79 `.me-card` → background
- polish.css:87 `.icon-btn` → background, color
- polish.css:116 `.channel` → background, color
- polish.css:176 `#chat-form` → border-color, background
- polish.css:184 `#chat-form button` → color
- polish.css:195 `.member` → background
- presence.css:5 `.status` → background-color
- presence.css:35 `#me-card .me-sub` → color
- presence.css:54 `.pc-status-text.editable` → background
- presence.css:67 `.status-idea` → border-color, color
- profile-media.css:47 `.sound-dropzone` → background, border-color
- profile-media.css:63 `.sound-trim-play` → background
- profile-media.css:76 `.sound-trim-window` → box-shadow
- profile-media.css:105 `.sound-file-change` → background
- profile-media.css:180 `#page-profile .profile-media-card` → background
- profile-media.css:216 `#settings .settings-content .profile-swatch` → box-shadow
- profile-media.css:243 `#page-profile #profile-preview-avatar` → outline-color
- profile-media.css:252 `#settings .settings-content .profile-preview-spot` → background
- profile-media.css:254 `#page-profile .profile-cover::after, #page-profile .profile-` → box-shadow
- profile-media.css:266 `#settings .settings-content .profile-preview-edit-photo` → background
- profile.css:49 `.pc-icon-btn` → background
- profile.css:73 `.pc-bio-add` → color, border-color, background
- profile.css:93 `.pc-btn` → background
- profile.css:113 `#profile-card.has-bg .pc-avatar .avatar` → box-shadow
- profile.css:114 `#profile-card.has-bg .pc-status` → border-color
- server-navigation.css:10 `.server-picker` → background, color
- server-navigation.css:34 `.server-dialog .dialog-close` → background, color
- server-navigation.css:54 `.server-dialog input` → border-color, box-shadow
- server-navigation.css:74 `.server-dialog :is(.btn-primary, .btn-danger, .secondary, .b` → background, color, box-shadow
- server-navigation.css:95 `.server-choice` → background, border-color, box-shadow
- server-navigation.css:109 `.choice-chev` → color
- server-navigation.css:127 `.server-dialog .welcome-action` → background
- server-navigation.css:138 `.server-dialog .create-preview` → background, color, border-color, box-shadow
- server-navigation.css:149 `.invite-field` → border-color, box-shadow
- server-navigation.css:159 `.invite-revoke` → background, color
- server-navigation.css:204 `.server-welcome-actions button` → background, color, box-shadow
- stream-zoom.css:20 `.sz-btn` → background
- stream-zoom.css:28 `.sz-level` → background
- style.css:117 `.btn-primary, .card button` → background
- style.css:141 `.rail-icon` → border-radius, background, color
- style.css:163 `.server-name` → background
- style.css:212 `.avatar` → box-shadow
- style.css:232 `.vp-btn` → background
- style.css:247 `.icon-btn` → background, color
- style.css:264 `.sb-btn` → background, border-color
- style.css:346 `.spoiler` → background
- style.css:351 `.mention` → background
- style.css:358 `.att-file` → background
- style.css:445 `.tile` → box-shadow
- style.css:470 `.tc-btn` → background
- style.css:511 `.sc-btn` → background
- voice-message.css:14 `#voice-rec button` → color, background
- voice-message.css:27 `.voice-rec-meter span` → height
- voice-message.css:40 `.vm-play` → background
- voice-message.css:50 `.vm-wave span` → background
- voice-message.css:55 `.vm-speed` → background, color

## Desfoque (`backdrop-filter` e `filter`)

- call-stage.css:73 `.stream-preview .sp-fill` — `filter: blur(24px) brightness(.55) saturate(1.15)`
- call-stage.css:112 `.tb` — `backdrop-filter: blur(6px)`
- call-stage.css:166 `.campv-badge` — `backdrop-filter: blur(6px)`
- changelog.css:2 `#changelog` — `backdrop-filter: blur(6px)`
- chat-media.css:34 `.embed-play` — `backdrop-filter: blur(4px)`
- chat-media.css:72 `#lightbox.modal` — `backdrop-filter: blur(6px)`
- clips.css:124 `.clip-item-length` — `backdrop-filter: blur(4px)`
- controls.css:133 `#create-channel, .confirm-overlay` — `backdrop-filter: blur(6px)`
- controls.css:134 `.channel-dialog::backdrop` — `backdrop-filter: blur(6px)`
- experience.css:39 `.settings-overlay` — `backdrop-filter: blur(8px)`
- feedback.css:28 `.feedback-overlay` — `backdrop-filter: blur(4px)`
- mudae-salao.css:276 `.salon-showcase-portrait` — `filter: blur(32px) saturate(1.12) brightness(.64)`
- mudae-salao.css:330 `.salon-reel-cell img` — `filter: blur(1.2px) saturate(1.15)`
- mudae-salao.css:605 `.salon-showcase-portrait` — `filter: blur(18px) saturate(1.08) brightness(.64)`
- music.css:37 `.dj-tile-art` — `filter: blur(2px) brightness(.6)`
- music.css:50 `.tile.dj.focus .dj-tile-art` — `filter: blur(56px) saturate(1.5) brightness(.5)`
- music.css:53 `.tile.dj.focus.paused .dj-tile-art` — `filter: blur(56px) saturate(.6) brightness(.35)`
- music.css:99 `.dj-stage-next` — `backdrop-filter: blur(14px)`
- music.css:120 `.dj-stage-bar` — `backdrop-filter: blur(16px)`
- profile-media.css:248 `#page-profile .profile-preview.has-bg .profile-preview-tag` — `backdrop-filter: blur(10px)`
- profile-media.css:252 `#settings .settings-content .profile-preview-spot` — `backdrop-filter: blur(8px)`
- profile-media.css:276 `#page-profile .profile-preview.has-bg .profile-chat-preview` — `backdrop-filter: blur(10px)`
- profile.css:118 `#profile-card.has-bg .pc-tag:not(.owner):not(.warn), #profile-card.has` — `backdrop-filter: blur(10px)`
- profile.css:120 `#profile-card.has-bg .pc-tag.owner` — `backdrop-filter: blur(10px)`
- profile.css:121 `#profile-card.has-bg .pc-tag.warn` — `backdrop-filter: blur(10px)`
- profile.css:123 `#profile-card.has-bg .pc-timeout` — `backdrop-filter: blur(10px)`
- profile.css:128 `#profile-card.has-bg .pc-playing-icon` — `backdrop-filter: blur(10px)`
- profile.css:129 `#profile-card.has-bg .pc-bio-add` — `backdrop-filter: blur(10px)`
- server-navigation.css:21 `#server-dialog` — `backdrop-filter: blur(6px)`
- stream-zoom.css:10 `.sz-hud` — `backdrop-filter: blur(12px)`
- style.css:507 `#stage-controls` — `backdrop-filter: blur(12px)`
